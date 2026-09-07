/**
 * Web Worker for generating SuperGlobule geometry and 2D cut patterns.
 * This offloads heavy computation from the main thread to prevent UI blocking.
 *
 * The message protocol and all logic live in `super-globule-worker-core.ts` so
 * they can be unit tested without a Worker; this file only binds it to `self`.
 */
import { createWorkerCore } from './super-globule-worker-core';

export type {
	WorkerMessage,
	WorkerResponse,
	GenerateMessage,
	PatternMessage
} from './super-globule-worker-core';

const core = createWorkerCore();

self.onmessage = (event: MessageEvent<import('./super-globule-worker-core').WorkerMessage>) => {
	core.handle(event.data, (response) => self.postMessage(response));
};
