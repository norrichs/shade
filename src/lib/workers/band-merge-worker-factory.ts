import type { PoolWorker } from './band-merge-pool';

/**
 * Builds a real band-merge Worker via Vite's `new URL(..., import.meta.url)`
 * worker-bundling convention.
 *
 * Split out of `band-merge-pool.ts` so that file stays importable under Jest:
 * this project's Jest config runs ts-jest without `--experimental-vm-modules`,
 * so any module containing `import.meta` throws `SyntaxError: Cannot use
 * 'import.meta' outside a module` the moment Jest transforms it — not just when
 * it runs. `band-merge-pool.ts` only reaches this module via a call-time
 * `import()`, and every pool test supplies its own `createWorker`, so this file
 * is never transformed during `npm run test:unit`. In the browser (Task 7),
 * the dynamic import resolves once and is cached by the pool.
 */
export const createBandMergeWorker = (): PoolWorker =>
	new Worker(new URL('./band-merge.worker.ts', import.meta.url), {
		type: 'module'
	}) as unknown as PoolWorker;
