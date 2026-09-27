import type { MergeMessage, MergeResponse } from './band-merge-worker-core';
import type { BandMergePayload } from '$lib/cut-pattern/band-merge-payload';
import type { MergeCtx } from '$lib/cut-pattern/merge-band';
import type { BandContourIndex } from '$lib/cut-pattern/contour-index';
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
	/**
	 * Stage 1b output per band, by id. Produced and consumed with `paths`, so a
	 * caller cannot publish one without the other and leave a band holding a
	 * path that nothing knows how to post-process.
	 */
	contours: Map<string, BandContourIndex>;
	/** Bands that failed, by id. A failed band does not fail the run. */
	errors: Map<string, string>;
	cancelled: boolean;
	/**
	 * This run's place in the pool's call order: starts at 1 and increases by
	 * exactly one on every `run()` call, including empty-payload and
	 * spawn-failure calls.
	 *
	 * `cancel()` always targets the most recently started non-empty run
	 * (an empty-payload `run([])` never takes the slot), but it can
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
 * True when a run failed wholesale: every band ended in `errors` and nothing
 * was published to `paths`. A caller should treat this as a failed run rather
 * than publishing an empty map — see the NavHeader `runPrepare` guard that
 * uses this. A run with *some* successful bands (however few) is a partial
 * success and must still publish those bands, so this deliberately does not
 * fire on a mix of `paths` and `errors`.
 */
export const isTotalPoolFailure = (result: PoolRunResult, bandCount: number): boolean =>
	bandCount > 0 && result.paths.size === 0 && result.errors.size === bandCount;

/**
 * Merge bands across a pool of workers created for this run and terminated when
 * it ends.
 *
 * Unlike the geometry worker — one singleton that lives for the session and
 * holds the SuperGlobule — a merge worker retains nothing between runs, so
 * keeping threads resident would cost memory and buy nothing.
 *
 * `cancel()` always affects only the most recently started non-empty run,
 * tracked by a generation counter: an older run still finishing in the
 * background is left alone, and a later empty-payload `run([])` never takes
 * over the slot, so it can never disarm a run that is still in flight.
 * Cancellation is latched the instant a run starts — before
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
		const contours = new Map<string, BandContourIndex>();
		const errors = new Map<string, string>();

		if (payloads.length === 0) {
			// Nothing to cancel, and nothing to disarm: nobody else's cancelCurrent
			// slot is touched here.
			return { paths, contours, errors, cancelled: false, generation: myGeneration };
		}

		let settled = false;
		let cancelledBeforeSpawn = false;
		const workers: PoolWorker[] = [];
		// Which band each worker is currently running, so an onerror — which
		// names no band — can still be attributed, and so a stray onerror on a
		// worker with nothing in flight can be told apart from a real one.
		const inFlight = new Map<PoolWorker, string>();
		// Bands that have actually completed (successfully or as an error),
		// tracked independently of `paths`/`errors` membership: `paths` only
		// records non-empty results, so a band that legitimately merged to
		// nothing would otherwise look indistinguishable from one that was
		// never processed at all, and get wrongly swept into an error below.
		const completedBands = new Set<string>();
		// Workers that errored once are never dispatched to again: a worker that
		// failed to run one band (script load failure, CSP block, missing
		// chunk, ...) has no reason to succeed at the next one, and handing it
		// more work is how a broken bundle turns into a permanent hang instead
		// of a loud failure.
		const deadWorkers = new Set<PoolWorker>();

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
			resolveRun({ paths, contours, errors, cancelled, generation: myGeneration });
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
				// A loud failure still completes the progress bar: nothing further will
				// ever run, so there is nothing left for the caller to wait on.
				safeProgress(payloads.length, payloads.length);
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
			try {
				worker.postMessage({ type: 'merge', bandId: payload.id, payload, ctx });
			} catch (error) {
				// A throw here (e.g. DataCloneError) happens inside `onmessage` on the
				// redispatch path (`completeBand` -> `dispatch`), so it must not escape
				// to the event loop: that would leave the run settled-never, the same
				// hung-spinner shape a dead worker already causes. Record the band as
				// failed and re-enter the completion path instead, exactly as a real
				// worker-level error would.
				errors.set(payload.id, errorMessage(error));
				deadWorkers.add(worker);
				completeBand(worker, payload.id);
			}
		};

		const completeBand = (worker: PoolWorker, bandId: string) => {
			completedBands.add(bandId);
			inFlight.delete(worker);
			done += 1;
			safeProgress(done, payloads.length);
			if (done >= payloads.length) {
				finish(false);
				return;
			}
			if (deadWorkers.has(worker)) {
				if (deadWorkers.size >= workers.length) {
					// Every worker in the pool has died. Nothing will ever call
					// dispatch again to drain the rest of the queue, so this would
					// hang forever if we didn't fail loudly here instead. This sweep
					// covers bands still sitting unassigned in the queue too, not
					// just ones that were in flight: nobody is ever going to hand
					// them to anyone.
					const failureMessage = 'no live workers remain to process this band';
					for (const remaining of payloads) {
						if (completedBands.has(remaining.id)) continue;
						completedBands.add(remaining.id);
						errors.set(remaining.id, failureMessage);
						done += 1;
						safeProgress(done, payloads.length);
					}
					finish(false);
				}
				// A live worker will pick up the rest of the queue the next time it
				// finishes its own band — do not hand more work to this one.
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
					const response = event.data;
					// A response must match the band this worker is CURRENTLY
					// running, not merely have some band in flight: a late or
					// duplicate response for a band this worker already finished
					// (and has since been redispatched past) must not be counted as
					// the completion of whatever it is running now — that would
					// silently drop the real band, the same failure mode as an
					// unattributed onerror.
					if (inFlight.get(worker) !== response.bandId) return;
					if (response.type === 'merge-result') {
						if (response.path.length > 0) {
							paths.set(response.bandId, response.path);
							contours.set(response.bandId, response.contours);
						}
					} else {
						errors.set(response.bandId, response.error);
					}
					completeBand(worker, response.bandId);
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
					// This worker just failed to run a band; it gets no more.
					deadWorkers.add(worker);
					completeBand(worker, bandId);
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
			// Same reasoning as the default-factory failure above: this is a loud,
			// terminal failure, so the progress bar should read as complete too.
			safeProgress(payloads.length, payloads.length);
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
