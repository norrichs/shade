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
};

export type BandMergePoolOptions = {
	createWorker?: () => PoolWorker;
	poolSize?: number;
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

/**
 * Merge bands across a pool of workers created for this run and terminated when
 * it ends.
 *
 * Unlike the geometry worker — one singleton that lives for the session and
 * holds the SuperGlobule — a merge worker retains nothing between runs, so
 * keeping threads resident would cost memory and buy nothing.
 */
export const createBandMergePool = (options: BandMergePoolOptions = {}) => {
	let cancelRun: (() => void) | null = null;

	const run = async (
		payloads: BandMergePayload[],
		ctx: MergeCtx,
		onProgress?: (done: number, total: number) => void
	): Promise<PoolRunResult> => {
		const paths = new Map<string, PathSegment[]>();
		const errors = new Map<string, string>();

		if (payloads.length === 0) {
			cancelRun = null;
			return { paths, errors, cancelled: false };
		}

		const createWorker = options.createWorker ?? (await resolveDefaultCreateWorker());

		return new Promise<PoolRunResult>((resolve) => {
			const size = options.poolSize
				? Math.max(1, Math.min(options.poolSize, payloads.length))
				: defaultPoolSize(payloads.length);

			const workers: PoolWorker[] = [];
			// Which band each worker is currently running, so an onerror — which
			// names no band — can still be attributed.
			const inFlight = new Map<PoolWorker, string>();
			let next = 0;
			let done = 0;
			let settled = false;

			const teardown = () => {
				for (const worker of workers) {
					worker.onmessage = null;
					worker.onerror = null;
					worker.terminate();
				}
			};

			const finish = (cancelled: boolean) => {
				if (settled) return;
				settled = true;
				cancelRun = null;
				teardown();
				resolve({ paths, errors, cancelled });
			};

			cancelRun = () => finish(true);

			const dispatch = (worker: PoolWorker) => {
				if (settled) return;
				if (next >= payloads.length) {
					inFlight.delete(worker);
					if (done >= payloads.length) finish(false);
					return;
				}
				const payload = payloads[next];
				next += 1;
				inFlight.set(worker, payload.id);
				worker.postMessage({ type: 'merge', bandId: payload.id, payload, ctx });
			};

			const complete = (worker: PoolWorker) => {
				done += 1;
				onProgress?.(done, payloads.length);
				if (done >= payloads.length) {
					finish(false);
					return;
				}
				dispatch(worker);
			};

			for (let i = 0; i < size; i += 1) {
				const worker = createWorker();
				workers.push(worker);
				worker.onmessage = (event) => {
					if (settled) return;
					const response = event.data;
					if (response.type === 'merge-result') {
						if (response.path.length > 0) paths.set(response.bandId, response.path);
					} else {
						errors.set(response.bandId, response.error);
					}
					complete(worker);
				};
				worker.onerror = (event) => {
					if (settled) return;
					const bandId = inFlight.get(worker);
					if (bandId) errors.set(bandId, event.message);
					complete(worker);
				};
			}

			for (const worker of workers) dispatch(worker);
		});
	};

	return {
		run,
		cancel: () => cancelRun?.()
	};
};
