import type { NestWorkerLike } from '$lib/cut-pattern/page-layout/nest/nest-client';

/**
 * Builds a real nest-layout Worker via Vite's `new URL(..., import.meta.url)`
 * worker-bundling convention.
 *
 * Split out of `nest-client.ts` so that file stays importable under Jest: any
 * module containing `import.meta` throws `SyntaxError: Cannot use 'import.meta'
 * outside a module` the moment Jest transforms it. `nest-client.ts` only reaches
 * this module via a call-time `import()`, and its tests inject their own worker
 * factory, so this file is never transformed during `npm run test:unit`.
 */
export const createNestLayoutWorker = (): NestWorkerLike =>
	new Worker(new URL('./nest-layout.worker.ts', import.meta.url), {
		type: 'module'
	}) as unknown as NestWorkerLike;
