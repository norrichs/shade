import { describe, it, expect } from '@jest/globals';
import { createBandMergePool, isTotalPoolFailure, type PoolWorker } from '../band-merge-pool';
import type { MergeMessage, MergeResponse } from '../band-merge-worker-core';
import type { BandMergePayload } from '$lib/cut-pattern/band-merge-payload';
import type { PathSegment } from '$lib/types';

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

/**
 * A fake worker that never replies on its own: the test decides exactly when
 * (and whether) each message is answered, by calling `onmessage`/`onerror`
 * directly. This is what lets a test assert on the pool's state *between*
 * dispatch and reply — something a queueMicrotask-based fake can't do, since
 * everything it posts resolves itself on the very next microtask tick.
 */
type ManualWorker = PoolWorker & { messages: MergeMessage[] };

const makeManualWorkers = () => {
	const workers: ManualWorker[] = [];
	const createWorker = (): PoolWorker => {
		const worker: ManualWorker = {
			messages: [],
			onmessage: null,
			onerror: null,
			postMessage: (message) => {
				worker.messages.push(message);
			},
			terminate: () => {}
		};
		workers.push(worker);
		return worker;
	};
	return { workers, createWorker };
};

/** An empty contour index: the pool carries indexes through, it never builds them. */
const noContours = (m: MergeMessage) => ({ seed: m.payload.seed, contours: [] });

const ok = (m: MergeMessage): MergeResponse => ({
	type: 'merge-result',
	bandId: m.bandId,
	path: [['M', 1, 1]],
	contours: noContours(m)
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
			path: [],
			contours: noContours(m)
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

	// --- Fix round 1: lifecycle correctness (C1, C2, I1-I6) ---------------

	it('is a no-op to cancel before any run has started', () => {
		const pool = createBandMergePool({ createWorker: makeFakeWorkers(ok).createWorker });
		expect(() => pool.cancel()).not.toThrow();
	});

	it('is a no-op to cancel after the run has already settled', async () => {
		const { createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const result = await pool.run([payload('a'), payload('b')], ctx);
		expect(() => pool.cancel()).not.toThrow();
		expect(result.cancelled).toBe(false);
	});

	it('cancels during the default-factory import window without spawning workers (C1)', async () => {
		let resolveFactory!: (fn: () => PoolWorker) => void;
		const factoryPromise = new Promise<() => PoolWorker>((resolve) => {
			resolveFactory = resolve;
		});
		let spawned = 0;
		const pool = createBandMergePool({
			loadDefaultCreateWorker: () => factoryPromise
		});

		const running = pool.run([payload('a'), payload('b')], ctx);
		// The pool is suspended awaiting the factory; nothing has spawned yet.
		pool.cancel();
		resolveFactory(() => {
			spawned += 1;
			return { onmessage: null, onerror: null, postMessage: () => {}, terminate: () => {} };
		});

		const result = await running;

		expect(result.cancelled).toBe(true);
		expect(spawned).toBe(0);
	});

	it('ignores a worker-level error when nothing is in flight for that worker (C2)', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const running = pool.run([payload('a'), payload('b'), payload('c')], ctx);
		const [w0, w1] = workers;
		// Initial dispatch: w0 <- a, w1 <- b.

		// Finish b first: w1 is freed and picks up c.
		w1.onmessage?.({ data: ok(w1.messages[0]) });
		expect(w1.messages).toHaveLength(2);
		expect(w1.messages[1].bandId).toBe('c');

		// Finish a: the queue is now exhausted, so w0 goes idle with nothing in
		// flight — but the run is not done, since c is still outstanding on w1.
		w0.onmessage?.({ data: ok(w0.messages[0]) });

		// A stray worker-level error on the now-idle w0 must not be attributed to
		// any band, must not count as a completion, and must not make the run
		// finish early while c is still genuinely in flight.
		w0.onerror?.({ message: 'stray failure with nothing in flight' });

		// c finishing for real must still land normally.
		w1.onmessage?.({ data: ok(w1.messages[1]) });

		const result = await running;
		expect(result.paths.size).toBe(3);
		expect(result.errors.size).toBe(0);
	});

	it('attributes an error to the band a reused worker is currently running, not its previous one', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 1 });

		const running = pool.run([payload('a'), payload('b')], ctx);
		const [worker] = workers;

		// Finish a; the single worker is reused for b.
		worker.onmessage?.({ data: ok(worker.messages[0]) });
		expect(worker.messages).toHaveLength(2);
		expect(worker.messages[1].bandId).toBe('b');

		// A worker-level error now must land on b, the band it is currently
		// running, not on a, which already completed.
		worker.onerror?.({ message: 'reused-worker failure' });

		const result = await running;
		expect(result.paths.get('a')).toBeDefined();
		expect(result.errors.get('a')).toBeUndefined();
		expect(result.errors.get('b')).toBe('reused-worker failure');
	});

	it('streams work across free workers instead of batching by round (I5)', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 3 });

		const running = pool.run(
			[payload('a'), payload('b'), payload('c'), payload('d'), payload('e'), payload('f')],
			ctx
		);

		// Initial fan-out: exactly one band per worker, three outstanding at once.
		expect(workers).toHaveLength(3);
		expect(workers.map((w) => w.messages.length)).toEqual([1, 1, 1]);
		expect(workers.map((w) => w.messages[0].bandId).sort()).toEqual(['a', 'b', 'c']);

		// Releasing ONE worker's reply must dispatch a fourth band immediately,
		// while the other two remain untouched. A batching implementation that
		// waits for every reply in a round before sending the next would leave
		// worker[0] at 1 message here, not 2.
		const [w0, w1, w2] = workers;
		w0.onmessage?.({ data: ok(w0.messages[0]) });

		expect(w0.messages).toHaveLength(2);
		expect(w0.messages[1].bandId).toBe('d');
		expect(w1.messages).toHaveLength(1);
		expect(w2.messages).toHaveLength(1);

		// Drain the rest in the same manually-controlled fashion.
		w1.onmessage?.({ data: ok(w1.messages[0]) }); // b done -> dispatch e
		w2.onmessage?.({ data: ok(w2.messages[0]) }); // c done -> dispatch f
		w0.onmessage?.({ data: ok(w0.messages[1]) }); // d done -> queue exhausted
		w1.onmessage?.({ data: ok(w1.messages[1]) }); // e done -> queue exhausted
		w2.onmessage?.({ data: ok(w2.messages[1]) }); // f done -> run finishes

		const result = await running;
		expect(result.paths.size).toBe(6);
		expect(result.cancelled).toBe(false);
	});

	it('cancel only affects the run that owns the current generation (I1)', async () => {
		const { createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const run1 = pool.run([payload('a'), payload('b'), payload('c')], ctx);
		const run2 = pool.run([payload('x'), payload('y')], ctx);
		// run2 is the current generation; cancel must leave run1 alone.
		pool.cancel();

		const [result1, result2] = await Promise.all([run1, run2]);

		expect(result1.cancelled).toBe(false);
		expect(result1.paths.size).toBe(3);
		expect(result2.cancelled).toBe(true);
	});

	// This scenario alone cancels synchronously before run 1 can ever
	// complete, so it exercises neither the round-1 bug (a settling run
	// nulling another run's slot) nor an intervening empty run losing the
	// cancellation. The two tests below supplement it with those cases; see
	// the fix-round-2 report for why this one is kept anyway (it still
	// documents the intended "current generation only" behaviour).

	it('cancel still reaches an in-flight run after an unrelated empty run in between (P3a)', async () => {
		const { createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const running = pool.run([payload('a'), payload('b'), payload('c')], ctx);
		// An unrelated empty run must not disarm the cancellation of the run
		// still in flight above it.
		await pool.run([], ctx);
		pool.cancel();

		const result = await running;
		expect(result.cancelled).toBe(true);
	});

	it('cancel still reaches run 2 after run 1 settles on its own first (P3b)', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 1 });

		const run1 = pool.run([payload('a')], ctx);
		const run2 = pool.run([payload('x')], ctx);
		// Each run() call creates its own worker(s) up front and synchronously,
		// so with poolSize 1 the first worker created belongs to run 1 and the
		// second to run 2.
		const [w0, w1] = workers;

		// Let run 1 finish entirely on its own, well before cancelling run 2.
		w0.onmessage?.({ data: ok(w0.messages[0]) });
		const result1 = await run1;
		expect(result1.cancelled).toBe(false);

		// cancel() must still reach run 2 — the slot it owns — even though a
		// different, older run holding the slot before it already settled.
		pool.cancel();

		const result2 = await run2;
		expect(result2.cancelled).toBe(true);
	});

	it('resolves instead of hanging when every worker in the pool dies (P1)', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 1 });

		const running = pool.run([payload('a'), payload('b')], ctx);
		const [worker] = workers;

		// The single worker dies on its first band. It must never be
		// re-dispatched to, and since it was the pool's only worker, the run
		// must resolve with the remaining band recorded as failed rather than
		// hang forever waiting for a dead worker to reply.
		worker.onerror?.({ message: 'worker crashed' });

		const result = await running;
		expect(result.errors.get('a')).toBe('worker crashed');
		expect(result.errors.has('b')).toBe(true);
		expect(result.paths.size).toBe(0);
	});

	it('lets a surviving worker drain the queue after a partial death (P1)', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const running = pool.run([payload('a'), payload('b'), payload('c')], ctx);
		const [w0, w1] = workers; // initial dispatch: w0 <- a, w1 <- b

		// w0 dies on its first band. It must never be handed more work.
		w0.onerror?.({ message: 'w0 crashed' });

		// The survivor, w1, finishes b and must be the one handed c next.
		w1.onmessage?.({ data: ok(w1.messages[0]) });
		expect(w1.messages).toHaveLength(2);
		expect(w1.messages[1].bandId).toBe('c');
		expect(w0.messages).toHaveLength(1);

		w1.onmessage?.({ data: ok(w1.messages[1]) });

		const result = await running;
		expect(result.errors.get('a')).toBe('w0 crashed');
		expect(result.paths.get('b')).toBeDefined();
		expect(result.paths.get('c')).toBeDefined();
		expect(result.cancelled).toBe(false);
	});

	it('records every still-queued band as an error when the last live worker dies (P1)', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 1 });

		const running = pool.run([payload('a'), payload('b'), payload('c')], ctx);
		const [worker] = workers;

		// a completes; the single worker is reused for b.
		worker.onmessage?.({ data: ok(worker.messages[0]) });
		expect(worker.messages[1].bandId).toBe('b');

		// The worker dies while running b. c is still queued and was never
		// dispatched to anyone — it must not be silently lost.
		worker.onerror?.({ message: 'died on b' });

		const result = await running;
		expect(result.paths.get('a')).toBeDefined();
		expect(result.errors.get('b')).toBe('died on b');
		expect(result.errors.has('c')).toBe(true);
		// c was never sent to the dead worker.
		expect(worker.messages).toHaveLength(2);
	});

	it('does not mislabel a band that legitimately merged to nothing when the pool then dies (Minor 3)', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 1 });

		// Three bands, so the all-dead sweep actually has to run: with only two
		// bands, the plain completion count reaches the total before the sweep
		// is ever consulted, and the bug this test targets never fires.
		const running = pool.run([payload('a'), payload('b'), payload('c')], ctx);
		const [worker] = workers;

		// a legitimately merges to nothing: no path, no error — that is a
		// valid outcome, not a failure. The worker is reused for b.
		worker.onmessage?.({
			data: { type: 'merge-result', bandId: 'a', path: [], contours: { seed: 0, contours: [] } }
		});
		expect(worker.messages[1].bandId).toBe('b');

		// The pool's only worker then dies running b, with c still queued and
		// never dispatched. The sweep must record c (and only c) as failed —
		// a lookup keyed on `paths`/`errors` membership would also catch a,
		// which never appears in either map despite having completed cleanly.
		worker.onerror?.({ message: 'died on b' });

		const result = await running;
		expect(result.paths.has('a')).toBe(false);
		expect(result.errors.has('a')).toBe(false);
		expect(result.errors.get('b')).toBe('died on b');
		expect(result.errors.has('c')).toBe(true);
	});

	it('reports progress for every band, including ones swept as errors, so done reaches total (Minor 4)', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 1 });
		const progress: number[] = [];

		const running = pool.run([payload('a'), payload('b'), payload('c')], ctx, (done) =>
			progress.push(done)
		);
		const [worker] = workers;

		worker.onmessage?.({ data: ok(worker.messages[0]) }); // a done -> 1/3
		worker.onerror?.({ message: 'died on b' }); // b done, then c swept -> 2/3, 3/3

		await running;
		expect(progress).toEqual([1, 2, 3]);
	});

	it('ignores a late response for a band the worker has already moved on from (P2)', async () => {
		const { workers, createWorker } = makeManualWorkers();
		const pool = createBandMergePool({ createWorker, poolSize: 1 });

		const running = pool.run([payload('a'), payload('b')], ctx);
		const [worker] = workers;

		// Finish a; the single worker is reused for b.
		worker.onmessage?.({ data: ok(worker.messages[0]) });
		expect(worker.messages[1].bandId).toBe('b');

		// A late/duplicate response for a arrives after the worker has moved on
		// to b. Guarding only on "does this worker have something in flight"
		// would accept it and wrongly count it as b's completion.
		worker.onmessage?.({ data: ok(worker.messages[0]) });

		// b's real reply arrives after — this must be what actually completes
		// the run, not the stale message above.
		worker.onmessage?.({ data: ok(worker.messages[1]) });

		const result = await running;
		expect(result.paths.size).toBe(2);
		expect(result.paths.get('a')).toBeDefined();
		expect(result.paths.get('b')).toBeDefined();
		expect(result.errors.size).toBe(0);
	});

	it('resolves with recorded errors and tears down partial workers when spawning throws (I3)', async () => {
		const createdWorkers: { terminated: boolean }[] = [];
		let calls = 0;
		const createWorker = (): PoolWorker => {
			calls += 1;
			if (calls === 2) throw new Error('spawn failed');
			const record = { terminated: false };
			createdWorkers.push(record);
			return {
				onmessage: null,
				onerror: null,
				postMessage: () => {},
				terminate: () => {
					record.terminated = true;
				}
			};
		};
		const pool = createBandMergePool({ createWorker, poolSize: 2 });
		const progress: number[] = [];

		const result = await pool.run([payload('a'), payload('b')], ctx, (done) => progress.push(done));

		expect(result.cancelled).toBe(false);
		expect(result.errors.size).toBeGreaterThan(0);
		expect(createdWorkers).toHaveLength(1);
		for (const worker of createdWorkers) expect(worker.terminated).toBe(true);
		// A loud failure must still complete the progress bar (round 4): the
		// caller has nothing further to wait on once this resolves.
		expect(progress[progress.length - 1]).toBe(2);
	});

	it('resolves with a recorded error when the default worker factory fails to load (I3)', async () => {
		const pool = createBandMergePool({
			loadDefaultCreateWorker: () => Promise.reject(new Error('import failed'))
		});
		const progress: number[] = [];

		const result = await pool.run([payload('a')], ctx, (done) => progress.push(done));

		expect(result.cancelled).toBe(false);
		expect(result.errors.get('a')).toBe('import failed');
		// Same as above: the default-factory rejection is a loud, terminal
		// failure, so progress must still reach total (round 4).
		expect(progress[progress.length - 1]).toBe(1);
	});

	it('does not deadlock when onProgress throws (I4)', async () => {
		const { createWorker } = makeFakeWorkers(ok);
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const result = await pool.run([payload('a'), payload('b'), payload('c')], ctx, () => {
			throw new Error('boom in ui code');
		});

		expect(result.paths.size).toBe(3);
		expect(result.cancelled).toBe(false);
	});

	it('records a redispatched band as an error instead of letting a throwing postMessage escape (Fix 2)', async () => {
		// The second worker throws on every postMessage, including the redispatch
		// `completeBand` -> `dispatch` sends it once the first band finishes. A
		// throw escaping onmessage there would leave the run settled-never (the
		// hung-spinner bug this file has already produced once), rather than
		// resolving with the band recorded as an error.
		let secondWorkerCalls = 0;
		const createdWorkers: { terminated: boolean }[] = [];
		const createWorker = (): PoolWorker => {
			const index = createdWorkers.length;
			const record = { terminated: false };
			createdWorkers.push(record);
			const worker: PoolWorker = {
				onmessage: null,
				onerror: null,
				postMessage: (message) => {
					if (index === 1) {
						secondWorkerCalls += 1;
						throw new Error('DataCloneError');
					}
					queueMicrotask(() => {
						if (!record.terminated) worker.onmessage?.({ data: ok(message) });
					});
				},
				terminate: () => {
					record.terminated = true;
				}
			};
			return worker;
		};
		const pool = createBandMergePool({ createWorker, poolSize: 2 });

		const result = await pool.run([payload('a'), payload('b'), payload('c')], ctx);

		// Only one throw: once a worker's postMessage throws it is marked dead
		// and gets no more work, so the queue's remaining bands drain through the
		// surviving worker instead of being handed back to the broken one.
		expect(secondWorkerCalls).toBe(1);
		expect(result.errors.size).toBe(1);
		expect(result.paths.size).toBe(2);
		expect(result.cancelled).toBe(false);
		for (const worker of createdWorkers) expect(worker.terminated).toBe(true);
	});

	describe('isTotalPoolFailure (Fix 1)', () => {
		it('is true when every band errored and nothing was published', () => {
			const result = {
				paths: new Map(),
				errors: new Map([
					['a', 'boom'],
					['b', 'boom']
				]),
				contours: new Map(),
				cancelled: false,
				generation: 1
			};

			expect(isTotalPoolFailure(result, 2)).toBe(true);
		});

		it('is false for a partial failure — some bands published, some errored', () => {
			const result = {
				paths: new Map([['a', [['M', 0, 0]] as unknown as PathSegment[]]]),
				errors: new Map([['b', 'boom']]),
				contours: new Map(),
				cancelled: false,
				generation: 1
			};

			expect(isTotalPoolFailure(result, 2)).toBe(false);
		});

		it('is false for a clean run with no errors at all', () => {
			const result = {
				paths: new Map([['a', [['M', 0, 0]] as unknown as PathSegment[]]]),
				errors: new Map(),
				contours: new Map(),
				cancelled: false,
				generation: 1
			};

			expect(isTotalPoolFailure(result, 1)).toBe(false);
		});

		it('is false for an empty payload run (nothing to fail)', () => {
			const result = {
				paths: new Map(),
				contours: new Map(),
				errors: new Map(),
				cancelled: false,
				generation: 1
			};

			expect(isTotalPoolFailure(result, 0)).toBe(false);
		});

		it('agrees with an actual pool run where the default factory fails to load', async () => {
			const pool = createBandMergePool({
				loadDefaultCreateWorker: () => Promise.reject(new Error('import failed'))
			});

			const result = await pool.run([payload('a'), payload('b')], ctx);

			expect(isTotalPoolFailure(result, 2)).toBe(true);
		});

		it('agrees with an actual pool run that only partially fails', async () => {
			const { createWorker } = makeFakeWorkers((m) =>
				m.bandId === 'b' ? { type: 'merge-error', bandId: 'b', error: 'boom' } : ok(m)
			);
			const pool = createBandMergePool({ createWorker, poolSize: 2 });

			const result = await pool.run([payload('a'), payload('b'), payload('c')], ctx);

			expect(isTotalPoolFailure(result, 3)).toBe(false);
		});
	});
});
