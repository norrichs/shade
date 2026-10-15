import { createNestClient, type NestWorkerLike } from '../nest-client';
import { runNestRequest } from '$lib/workers/nest-layout-worker-core';

// A fake worker that answers asynchronously, in order, via the real core.
const fakeWorker = (): NestWorkerLike => {
	const w: NestWorkerLike = {
		onmessage: null,
		postMessage: (m) => setTimeout(() => w.onmessage?.({ data: runNestRequest(m) }), 0),
		terminate: () => {}
	};
	return w;
};
const geom = {
	pageScale: 1,
	pageWidth: 100,
	pageHeight: 100,
	contentWidth: 100,
	contentHeight: 100,
	marginPx: 0,
	pageGap: 10,
	gap: 0,
	reorderWindow: 1,
	allowRotation: false,
	rotationStep: 0,
	cellMm: 1
};
const sq = {
	polygons: [
		[
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 }
		]
	],
	pivot: { x: 5, y: 5 }
};

it('resolves with Vector3 origins', async () => {
	const c = createNestClient(async () => fakeWorker());
	const r = await c.request([sq], geom);
	expect(r?.origins[0].isVector3).toBe(true);
});
it('a newer request supersedes an older one', async () => {
	const c = createNestClient(async () => fakeWorker());
	const first = c.request([sq], geom);
	const second = c.request([sq, sq], geom);
	expect(await first).toBeNull();
	expect((await second)?.origins).toHaveLength(2);
});
it('creates the worker once', async () => {
	const factory = jest.fn(async () => fakeWorker());
	const c = createNestClient(factory);
	await c.request([sq], geom);
	await c.request([sq], geom);
	expect(factory).toHaveBeenCalledTimes(1);
});
