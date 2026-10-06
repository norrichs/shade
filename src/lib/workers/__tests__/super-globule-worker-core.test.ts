import { describe, it, expect, jest } from '@jest/globals';
import { createWorkerCore, type WorkerResponse } from '../super-globule-worker-core';
import type { PatternMessage } from '../super-globule-worker-core';

const geometry = { projections: [], globuleTubes: [], subGlobules: [] } as never;
const patternMsg = (over: Partial<PatternMessage> = {}): PatternMessage => ({
	type: 'pattern',
	requestId: 10,
	geometryRequestId: 1,
	superConfig: { id: 'c' } as never,
	genConfig: {} as never,
	gates: { globule: false, globuleTube: false, projection: false, voronoi: true },
	...over
});

const makeCore = () => {
	const generateSuperGlobule = jest.fn<(...args: unknown[]) => unknown>(() => geometry);
	const runPatternGeneration = jest.fn<(...args: unknown[]) => unknown>(() => ({
		voronoiPattern: 'p'
	}));
	const posted: WorkerResponse[] = [];
	const core = createWorkerCore({
		generateSuperGlobule: generateSuperGlobule as never,
		runPatternGeneration: runPatternGeneration as never,
		stripNonSerializable: (g) => ({ ...(g as object), stripped: true }) as never,
		now: () => 0,
		log: () => {}
	});
	return {
		core,
		posted,
		post: (r: WorkerResponse) => posted.push(r),
		generateSuperGlobule,
		runPatternGeneration
	};
};

describe('worker core', () => {
	it('generates geometry, posts the stripped result and holds the live one', () => {
		const { core, posted, post, generateSuperGlobule } = makeCore();
		core.handle({ type: 'generate', payload: {} as never, gates: {} as never, requestId: 1 }, post);
		expect(generateSuperGlobule).toHaveBeenCalledTimes(1);
		expect(posted).toEqual([
			{ type: 'result', payload: { ...geometry, stripped: true }, requestId: 1 }
		]);
		expect(core.heldGeometryRequestId()).toBe(1);
	});

	it('runs pattern generation against the held geometry', () => {
		const { core, posted, post, runPatternGeneration } = makeCore();
		core.handle({ type: 'generate', payload: {} as never, gates: {} as never, requestId: 1 }, post);
		core.handle(patternMsg(), post);
		expect(runPatternGeneration).toHaveBeenCalledWith(
			expect.objectContaining({ superGlobule: geometry, superConfig: { id: 'c' } })
		);
		expect(posted[1]).toEqual({
			type: 'pattern-result',
			payload: { voronoiPattern: 'p' },
			requestId: 10,
			durationMs: 0
		});
	});

	it('reports stale when the requested geometry is not the one held', () => {
		const { core, posted, post, runPatternGeneration } = makeCore();
		core.handle(patternMsg({ geometryRequestId: 7 }), post);
		expect(runPatternGeneration).not.toHaveBeenCalled();
		expect(posted[0]).toEqual({
			type: 'pattern-stale',
			requestId: 10,
			geometryRequestId: 7,
			heldGeometryRequestId: null
		});

		core.handle({ type: 'generate', payload: {} as never, gates: {} as never, requestId: 2 }, post);
		core.handle(patternMsg({ geometryRequestId: 1 }), post);
		expect(posted[2]).toMatchObject({ type: 'pattern-stale', heldGeometryRequestId: 2 });
	});

	it('posts typed errors for each phase', () => {
		const { core, posted, post, generateSuperGlobule, runPatternGeneration } = makeCore();
		generateSuperGlobule.mockImplementationOnce(() => {
			throw new Error('geo boom');
		});
		core.handle({ type: 'generate', payload: {} as never, gates: {} as never, requestId: 1 }, post);
		expect(posted[0]).toEqual({ type: 'error', error: 'geo boom', requestId: 1 });

		core.handle({ type: 'generate', payload: {} as never, gates: {} as never, requestId: 2 }, post);
		runPatternGeneration.mockImplementationOnce(() => {
			throw new Error('pattern boom');
		});
		core.handle(patternMsg({ geometryRequestId: 2 }), post);
		expect(posted[2]).toEqual({ type: 'pattern-error', error: 'pattern boom', requestId: 10 });
	});
});

describe('worker core — asset loading', () => {
	const generateMsg = (requestId: number) =>
		({ type: 'generate', payload: { id: `c${requestId}` }, gates: {}, requestId }) as never;

	const makeAsyncCore = (ensureAssets: (config: { id: string }) => Promise<void> | undefined) => {
		const generateSuperGlobule = jest.fn<(...args: unknown[]) => unknown>(() => geometry);
		const posted: WorkerResponse[] = [];
		const core = createWorkerCore({
			generateSuperGlobule: generateSuperGlobule as never,
			stripNonSerializable: (g) => g,
			ensureAssets: ensureAssets as never,
			now: () => 0,
			log: () => {}
		});
		return { core, posted, post: (r: WorkerResponse) => posted.push(r), generateSuperGlobule };
	};

	it('waits for assets before generating', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const { core, posted, post, generateSuperGlobule } = makeAsyncCore(() => gate);
		core.handle(generateMsg(1), post);
		expect(generateSuperGlobule).not.toHaveBeenCalled();
		release();
		await gate;
		await new Promise((r) => setTimeout(r, 0));
		expect(posted.map((p) => p.requestId)).toEqual([1]);
	});

	it('posts results in request order even if a later request needs no loading', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const { core, posted, post } = makeAsyncCore((config) =>
			config.id === 'c1' ? gate : undefined
		);
		core.handle(generateMsg(1), post); // waits on the gate
		core.handle(generateMsg(2), post); // assets ready, but must queue behind 1
		expect(posted).toEqual([]);
		release();
		await new Promise((r) => setTimeout(r, 0));
		expect(posted.map((p) => p.requestId)).toEqual([1, 2]);
		expect(core.heldGeometryRequestId()).toBe(2);
	});

	it('keeps serving requests after a post throws', async () => {
		const { core, posted } = makeAsyncCore((config) =>
			config.id === 'c1' ? Promise.resolve() : undefined
		);
		const failing = () => {
			throw new Error('post failed');
		};
		const okPost = (r: WorkerResponse) => posted.push(r);
		core.handle(generateMsg(1), failing);
		core.handle(generateMsg(2), okPost); // queued behind the failing job
		await new Promise((r) => setTimeout(r, 0));
		expect(posted.map((p) => p.requestId)).toEqual([2]);
		core.handle(generateMsg(3), okPost); // queue drained: runs synchronously
		expect(posted.map((p) => p.requestId)).toEqual([2, 3]);
	});

	it('still generates when asset loading rejects', async () => {
		const { core, posted, post } = makeAsyncCore(() => Promise.reject(new Error('idb down')));
		core.handle(generateMsg(1), post);
		await new Promise((r) => setTimeout(r, 0));
		expect(posted.map((p) => p.type)).toEqual(['result']);
	});
});
