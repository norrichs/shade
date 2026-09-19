/**
 * Web Worker that merges one band per message.
 *
 * The protocol and all logic live in `band-merge-worker-core.ts` so they can be
 * unit tested without a Worker; this file only binds it to `self`.
 */
import { createBandMergeCore } from './band-merge-worker-core';

export type { MergeMessage, MergeResponse } from './band-merge-worker-core';

const core = createBandMergeCore();

self.onmessage = (event: MessageEvent<import('./band-merge-worker-core').MergeMessage>) => {
	core.handle(event.data, (response) => self.postMessage(response));
};
