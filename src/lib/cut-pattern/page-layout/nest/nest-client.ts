import { Vector3 } from 'three';
import type { PageLayoutResult } from '../types';
import type { NestGeom } from './nest';
import type { NestShape } from './types';
import type { NestRequest, NestResponse } from '#lib/workers/nest-layout-worker-core.js';

export type NestWorkerLike = {
	postMessage(m: NestRequest): void;
	onmessage: ((e: { data: NestResponse }) => void) | null;
	onerror?: ((e: unknown) => void) | null;
	onmessageerror?: ((e: unknown) => void) | null;
	terminate(): void;
};

export const createNestClient = (createWorker: () => Promise<NestWorkerLike>) => {
	let worker: Promise<NestWorkerLike> | undefined;
	let nextId = 0;
	const waiting = new Map<number, (r: PageLayoutResult | null) => void>();

	const resolveAllNull = () => {
		for (const resolve of waiting.values()) resolve(null);
		waiting.clear();
	};

	/** Drop the cached worker and terminate it once (if ever) it has started. */
	const discardWorker = () => {
		const old = worker;
		worker = undefined;
		old?.then((w) => w.terminate()).catch(() => {});
	};

	// Request ids are unique and `waiting` only ever holds the newest, so a late
	// reply from a superseded or terminated worker never resolves anything.
	const onMessage = (e: { data: NestResponse }) => {
		const { requestId, result, error } = e.data;
		const resolve = waiting.get(requestId);
		if (!resolve) return; // superseded
		waiting.delete(requestId);
		if (error || !result) {
			console.error('nest layout worker:', error);
			resolve(null);
			return;
		}
		resolve({ ...result, origins: result.origins.map((o) => new Vector3(o.x, o.y, 0)) });
	};

	const getWorker = () => {
		if (!worker) {
			const created: Promise<NestWorkerLike> = createWorker().then((w) => {
				w.onmessage = onMessage;
				// Module load failure, OOM or an uncaught throw: without this the
				// pending request would never settle.
				w.onerror = w.onmessageerror = (err) => {
					console.error('nest layout worker error:', err);
					w.terminate();
					if (worker !== created) return; // already discarded
					worker = undefined;
					resolveAllNull();
				};
				return w;
			});
			worker = created;
		}
		return worker;
	};

	return {
		request(shapes: NestShape[], geom: NestGeom): Promise<PageLayoutResult | null> {
			const requestId = ++nextId;
			// A still-pending request would otherwise run to completion in the single
			// FIFO worker before this one starts: kill it and start a fresh worker.
			if (waiting.size > 0) {
				resolveAllNull();
				discardWorker();
			}
			return new Promise((resolve) => {
				waiting.set(requestId, resolve);
				const wp = getWorker();
				wp.then((w) => w.postMessage({ requestId, shapes, geom })).catch((err) => {
					console.error('nest layout worker failed to start:', err);
					if (worker === wp) worker = undefined;
					if (waiting.delete(requestId)) resolve(null);
				});
			});
		},
		dispose() {
			resolveAllNull();
			discardWorker();
		}
	};
};

export const nestClient = createNestClient(() =>
	import('#lib/workers/nest-layout-worker-factory.js').then((m) => m.createNestLayoutWorker())
);
