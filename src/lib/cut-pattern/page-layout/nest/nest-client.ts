import { Vector3 } from 'three';
import type { PageLayoutResult } from '../types';
import type { NestGeom } from './nest';
import type { NestShape } from './types';
import type { NestRequest, NestResponse } from '$lib/workers/nest-layout-worker-core';

export type NestWorkerLike = {
	postMessage(m: NestRequest): void;
	onmessage: ((e: { data: NestResponse }) => void) | null;
	terminate(): void;
};

export const createNestClient = (createWorker: () => Promise<NestWorkerLike>) => {
	let worker: Promise<NestWorkerLike> | undefined;
	let nextId = 0;
	const waiting = new Map<number, (r: PageLayoutResult | null) => void>();

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
			worker = createWorker().then((w) => {
				w.onmessage = onMessage;
				return w;
			});
		}
		return worker;
	};

	return {
		request(shapes: NestShape[], geom: NestGeom): Promise<PageLayoutResult | null> {
			const requestId = ++nextId;
			for (const [id, resolve] of waiting) {
				waiting.delete(id);
				resolve(null);
			}
			return new Promise((resolve) => {
				waiting.set(requestId, resolve);
				getWorker()
					.then((w) => w.postMessage({ requestId, shapes, geom }))
					.catch((err) => {
						console.error('nest layout worker failed to start:', err);
						worker = undefined;
						if (waiting.delete(requestId)) resolve(null);
					});
			});
		},
		dispose() {
			for (const resolve of waiting.values()) resolve(null);
			waiting.clear();
			worker?.then((w) => w.terminate());
			worker = undefined;
		}
	};
};

export const nestClient = createNestClient(() =>
	import('$lib/workers/nest-layout-worker-factory').then((m) => m.createNestLayoutWorker())
);
