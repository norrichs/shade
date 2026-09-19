import { describe, it, expect } from '@jest/globals';
import { createBandMergePool, type PoolWorker } from '../band-merge-pool';
import type { MergeMessage, MergeResponse } from '../band-merge-worker-core';
import type { BandMergePayload } from '$lib/cut-pattern/band-merge-payload';

const payload = (id: string): BandMergePayload => ({
	id,
	facets: [{ path: [['M', 0, 0]], strokeWidth: 1 }],
	pieceStartFraction: 0,
	pieceEndFraction: 1,
	seed: 1
});

const ctx = { patternType: 'tiledHexPattern', keepConnected: 0 };

/** A fake worker that answers on the microtask queue, and records what it saw. */
const makeFakeWorkers = (reply: (m: MergeMessage) => MergeResponse) => {
	const created: { messages: MergeMessage[]; terminated: boolean }[] = [];
	const createWorker = (): PoolWorker => {
		const record = { messages: [] as MergeMessage[], terminated: false };
		created.push(record);
		const worker: PoolWorker = {
			onmessage: null,
			onerror: null,
			postMessage: (message) => {
				record.messages.push(message);
				queueMicrotask(() => {
					if (!record.terminated) worker.onmessage?.({ data: reply(message) });
				});
			},
			terminate: () => {
				record.terminated = true;
			}
		};
		return worker;
	};
	return { created, createWorker };
};

const ok = (m: MergeMessage): MergeResponse => ({
	type: 'merge-result',
	bandId: m.bandId,
	path: [['M', 1, 1]]
});

describe('band merge pool', () => {
	it('merges every band and reports progress once per band', async () => {
		const { createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 3 });
		const progress: number[] = [];

		const result = await pool.run(
			[payload('a'), payload('b'), payload('c'), payload('d')],
			ctx,
			(done) => progress.push(done)
		);

		expect(result.paths.size).toBe(4);
		expect(result.cancelled).toBe(false);
		expect(progress).toEqual([1, 2, 3, 4]);
	});

	it('spreads work across the pool rather than queueing it on one worker', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 3 });

		await pool.run([payload('a'), payload('b'), payload('c')], ctx);

		expect(created).toHaveLength(3);
		for (const worker of created) expect(worker.messages.length).toBeGreaterThan(0);
	});

	it('never spawns more workers than there are bands', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 8 });

		await pool.run([payload('only')], ctx);

		expect(created).toHaveLength(1);
	});

	it('collects a failed band without failing the run', async () => {
		const { createWorker } = makeFakeWorkers((m) =>
			m.bandId === 'b' ? { type: 'merge-error', bandId: 'b', error: 'boom' } : ok(m)
		);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const result = await pool.run([payload('a'), payload('b'), payload('c')], ctx);

		expect(result.paths.size).toBe(2);
		expect(result.errors.get('b')).toBe('boom');
	});

	it('drops empty paths so unmergeable bands leave no entry', async () => {
		const { createWorker } = makeFakeWorkers((m) => ({
			type: 'merge-result',
			bandId: m.bandId,
			path: []
		}));
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const result = await pool.run([payload('a'), payload('b')], ctx);

		expect(result.paths.size).toBe(0);
		expect(result.errors.size).toBe(0);
	});

	it('terminates every worker when the run finishes', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		await pool.run([payload('a'), payload('b')], ctx);

		for (const worker of created) expect(worker.terminated).toBe(true);
	});

	it('cancels in flight, resolves cancelled and terminates the workers', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const running = pool.run([payload('a'), payload('b'), payload('c')], ctx);
		pool.cancel();
		const result = await running;

		expect(result.cancelled).toBe(true);
		for (const worker of created) expect(worker.terminated).toBe(true);
	});

	it('resolves immediately for an empty band list without spawning workers', async () => {
		const { created, createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 4 });

		const result = await pool.run([], ctx);

		expect(result.paths.size).toBe(0);
		expect(created).toHaveLength(0);
	});

	it('records a worker-level error against the band it was running', async () => {
		const created: PoolWorker[] = [];
		const createWorker = (): PoolWorker => {
			const worker: PoolWorker = {
				onmessage: null,
				onerror: null,
				postMessage: () => queueMicrotask(() => worker.onerror?.({ message: 'worker died' })),
				terminate: () => {}
			};
			created.push(worker);
			return worker;
		};
		const pool = createBandMergePool({ createWorker, poolSize: 1 });

		const result = await pool.run([payload('a')], ctx);

		expect(result.errors.get('a')).toBe('worker died');
	});
});
