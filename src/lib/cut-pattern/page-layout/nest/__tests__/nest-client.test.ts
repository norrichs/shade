import { createNestClient, type NestWorkerLike } from '../nest-client';
import { runNestRequest, type NestRequest } from '$lib/workers/nest-layout-worker-core';

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

// A worker whose replies the test delivers by hand.
const manualWorker = () => {
	const posted: NestRequest[] = [];
	const terminate = jest.fn();
	const w: NestWorkerLike = { onmessage: null, postMessage: (m) => posted.push(m), terminate };
	const reply = (i: number) => w.onmessage?.({ data: runNestRequest(posted[i]) });
	return { w, posted, reply, terminate };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('stale replies', () => {
	it.each([
		['A delivered after B', [1, 0]],
		['A delivered before B', [0, 1]]
	])('ignores superseded reply (%s)', async (_n, order) => {
		const m = manualWorker();
		const c = createNestClient(async () => m.w);
		const a = c.request([sq], geom);
		const b = c.request([sq, sq], geom);
		await flush();
		expect(m.posted).toHaveLength(2);
		for (const i of order) m.reply(i);
		expect(await a).toBeNull();
		expect((await b)?.origins).toHaveLength(2);
	});
});

describe('errors and lifecycle', () => {
	it('resolves null and logs on a worker error reply', async () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const m = manualWorker();
			const c = createNestClient(async () => m.w);
			const p = c.request([sq], geom);
			await flush();
			m.w.onmessage?.({ data: { requestId: m.posted[0].requestId, error: 'x' } });
			expect(await p).toBeNull();
			expect(spy).toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});
	it('dispose resolves pending null and terminates the worker', async () => {
		const m = manualWorker();
		const c = createNestClient(async () => m.w);
		const p = c.request([sq], geom);
		await flush();
		c.dispose();
		expect(await p).toBeNull();
		await flush();
		expect(m.terminate).toHaveBeenCalled();
	});
	it('resolves null, logs, and retries when worker creation rejects', async () => {
		const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const factory = jest
				.fn<Promise<NestWorkerLike>, []>()
				.mockRejectedValueOnce(new Error('boom'))
				.mockImplementation(async () => fakeWorker());
			const c = createNestClient(factory);
			expect(await c.request([sq], geom)).toBeNull();
			expect(spy).toHaveBeenCalled();
			expect((await c.request([sq], geom))?.origins).toHaveLength(1);
			expect(factory).toHaveBeenCalledTimes(2);
		} finally {
			spy.mockRestore();
		}
	});
});
