import type { MergeMessage, MergeResponse } from './band-merge-worker-core';
import type { BandMergePayload } from '$lib/cut-pattern/band-merge-payload';
import type { MergeCtx } from '$lib/cut-pattern/merge-band';
import type { PathSegment } from '$lib/types';

/** The slice of the `Worker` API the pool uses, so tests can inject a fake. */
export type PoolWorker = {
	postMessage(message: MergeMessage): void;
	terminate(): void;
	onmessage: ((event: { data: MergeResponse }) => void) | null;
	onerror: ((event: { message: string }) => void) | null;
};

export type PoolRunResult = {
	paths: Map<string, PathSegment[]>;
	/** Bands that failed, by id. A failed band does not fail the run. */
	errors: Map<string, string>;
	cancelled: boolean;
	/**
	 * This run's place in the pool's call order: starts at 1 and increases by
	 * exactly one on every `run()` call, including empty-payload and
	 * spawn-failure calls.
	 *
	 * `cancel()` always targets the most recently started run, but it can
	 * still race that run's final response and lose (see the module doc on
	 * `createBandMergePool`) — `cancelled` alone cannot enforce "a superseded
	 * run's paths must never be published." A caller that starts a new run to
	 * replace an old one should track which generation it actually still
	 * wants and compare it against this field before publishing anything from
	 * `paths`, rather than trusting `cancelled` in isolation.
	 */
	generation: number;
};

export type BandMergePoolOptions = {
	createWorker?: () => PoolWorker;
	poolSize?: number;
	/**
	 * Test-only override for how the pool loads its default worker factory
	 * when `createWorker` is omitted. Lets tests reach the async
	 * default-resolution window (see the C1 fix in the task-5 report) without
	 * depending on `band-merge-worker-factory.ts`, which cannot be imported
	 * under this project's Jest configuration (it contains `import.meta`, and
	 * this project runs Jest without `--experimental-vm-modules`).
	 */
	loadDefaultCreateWorker?: () => Promise<() => PoolWorker>;
};

// Resolved lazily, via a call-time `import()`, and cached — see
// `band-merge-worker-factory.ts` for why this cannot be a plain top-level
// import or a synchronous function defined in this file.
let cachedDefaultCreateWorker: (() => PoolWorker) | null = null;
const resolveDefaultCreateWorker = async (): Promise<() => PoolWorker> => {
	if (!cachedDefaultCreateWorker) {
		const { createBandMergeWorker } = await import('./band-merge-worker-factory');
		cachedDefaultCreateWorker = createBandMergeWorker;
	}
	return cachedDefaultCreateWorker;
};

/** One core is left for the main thread, whose responsiveness is the point. */
export const defaultPoolSize = (bandCount: number): number =>
	Math.max(
		1,
		Math.min(
			bandCount,
			(typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4) - 1,
			8
		)
	);

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Merge bands across a pool of workers created for this run and terminated when
 * it ends.
 *
 * Unlike the geometry worker — one singleton that lives for the session and
 * holds the SuperGlobule — a merge worker retains nothing between runs, so
 * keeping threads resident would cost memory and buy nothing.
 *
 * `cancel()` always affects only the most recently started run, tracked by a
 * generation counter: an older run still finishing in the background is left
 * alone, and a later empty-payload short-circuit never disarms a run that is
 * still in flight. Cancellation is latched the instant a run starts — before
 * any `await` — so a `cancel()` that arrives while the pool is still
 * resolving its default worker factory is never a silent no-op.
 */
export const createBandMergePool = (options: BandMergePoolOptions = {}) => {
	let generation = 0;
	let cancelCurrent: { generation: number; cancel: () => void } | null = null;

	const run = async (
		payloads: BandMergePayload[],
		ctx: MergeCtx,
		onProgress?: (done: number, total: number) => void
	): Promise<PoolRunResult> => {
		const myGeneration = ++generation;
		const paths = new Map<string, PathSegment[]>();
		const errors = new Map<string, string>();

		if (payloads.length === 0) {
			// Nothing to cancel, and nothing to disarm: nobody else's cancelCurrent
			// slot is touched here.
			return { paths, errors, cancelled: false, generation: myGeneration };
		}

		let settled = false;
		let cancelledBeforeSpawn = false;
		const workers: PoolWorker[] = [];
		// Which band each worker is currently running, so an onerror — which
		// names no band — can still be attributed, and so a stray onerror on a
		// worker with nothing in flight can be told apart from a real one.
		const inFlight = new Map<PoolWorker, string>();

		let resolveRun!: (result: PoolRunResult) => void;
		const resultPromise = new Promise<PoolRunResult>((resolve) => {
			resolveRun = resolve;
		});

		const teardown = () => {
			for (const worker of workers) {
				worker.onmessage = null;
				worker.onerror = null;
				try {
					worker.terminate();
				} catch {
					// Best-effort: the run is settling regardless, with every handler
					// already detached.
				}
			}
		};

		const finish = (cancelled: boolean) => {
			if (settled) return;
			settled = true;
			if (cancelCurrent?.generation === myGeneration) cancelCurrent = null;
			teardown();
			resolveRun({ paths, errors, cancelled, generation: myGeneration });
		};

		const safeProgress = (done: number, total: number) => {
			if (!onProgress) return;
			try {
				onProgress(done, total);
			} catch {
				// `onProgress` is caller-supplied UI code (a Svelte store write in
				// Task 7); a throw there must never be able to break dispatch.
			}
		};

		// Registered before any `await` below, so a `cancel()` that arrives while
		// we are still resolving the worker factory is latched immediately
		// rather than finding a null slot and doing nothing.
		cancelCurrent = {
			generation: myGeneration,
			cancel: () => {
				if (settled) return;
				if (workers.length === 0) {
					cancelledBeforeSpawn = true;
				} else {
					finish(true);
				}
			}
		};

		let createWorker: () => PoolWorker;
		try {
			const loadDefault = options.loadDefaultCreateWorker ?? resolveDefaultCreateWorker;
			createWorker = options.createWorker ?? (await loadDefault());
		} catch (error) {
			if (cancelledBeforeSpawn) {
				finish(true);
			} else {
				for (const payload of payloads) errors.set(payload.id, errorMessage(error));
				finish(false);
			}
			return resultPromise;
		}

		if (cancelledBeforeSpawn) {
			finish(true);
			return resultPromise;
		}

		let next = 0;
		let done = 0;

		const dispatch = (worker: PoolWorker) => {
			if (settled) return;
			if (next >= payloads.length) {
				if (done >= payloads.length) finish(false);
				return;
			}
			const payload = payloads[next];
			next += 1;
			inFlight.set(worker, payload.id);
			worker.postMessage({ type: 'merge', bandId: payload.id, payload, ctx });
		};

		const completeBand = (worker: PoolWorker) => {
			inFlight.delete(worker);
			done += 1;
			safeProgress(done, payloads.length);
			if (done >= payloads.length) {
				finish(false);
				return;
			}
			dispatch(worker);
		};

		try {
			const size = options.poolSize
				? Math.max(1, Math.min(options.poolSize, payloads.length))
				: defaultPoolSize(payloads.length);

			for (let i = 0; i < size; i += 1) {
				const worker = createWorker();
				workers.push(worker);
				worker.onmessage = (event) => {
					if (settled) return;
					// A response naming a band this worker isn't currently running
					// (already completed, or never dispatched) must not be double
					// counted.
					if (!inFlight.has(worker)) return;
					const response = event.data;
					if (response.type === 'merge-result') {
						if (response.path.length > 0) paths.set(response.bandId, response.path);
					} else {
						errors.set(response.bandId, response.error);
					}
					completeBand(worker);
				};
				worker.onerror = (event) => {
					if (settled) return;
					const bandId = inFlight.get(worker);
					// A worker-level error names no band. If this worker has nothing
					// in flight — e.g. it already finished its last band and the
					// queue is empty — there is no band to blame, and crucially no
					// completion to count either: counting one here would let a
					// still-genuinely-in-flight band on another worker vanish from
					// both `paths` and `errors` when the run finishes early.
					if (bandId === undefined) return;
					errors.set(bandId, event.message);
					completeBand(worker);
				};
			}
		} catch (error) {
			// A worker failed to spawn (CSP, missing chunk, resource limits, ...).
			// Any workers already created must still be torn down, and the run
			// must still resolve — never reject — with the failure recorded
			// against whatever bands never got a chance to run.
			for (const payload of payloads) {
				if (!paths.has(payload.id) && !errors.has(payload.id)) {
					errors.set(payload.id, errorMessage(error));
				}
			}
			finish(false);
			return resultPromise;
		}

		for (const worker of workers) dispatch(worker);

		return resultPromise;
	};

	return {
		run,
		cancel: () => cancelCurrent?.cancel()
	};
};
