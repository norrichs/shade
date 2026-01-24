/**
 * Web Worker for generating SuperGlobule geometry
 * This offloads heavy computation from the main thread to prevent UI blocking
 */

import { generateSuperGlobule } from '$lib/generate-superglobule';
import type { SuperGlobuleConfig, SuperGlobule } from '$lib/types';

export type WorkerMessage = {
	type: 'generate';
	payload: SuperGlobuleConfig;
	requestId: number;
};

export type WorkerResponse =
	| {
			type: 'result';
			payload: SuperGlobule;
			requestId: number;
	  }
	| {
			type: 'error';
			error: string;
			requestId: number;
	  };

/**
 * Strips non-serializable Object3D instances from the result
 * The surface can be regenerated on the main thread if needed
 */
function stripNonSerializable(superGlobule: SuperGlobule): SuperGlobule {
	return {
		...superGlobule,
		projections: superGlobule.projections.map((projection) => ({
			...projection,
			// Replace Object3D with null - it can't be serialized
			// and can be regenerated on main thread if needed
			surface: null as unknown as typeof projection.surface
		}))
	};
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
	const { type, payload, requestId } = event.data;

	if (type === 'generate') {
		try {
			console.log('[Worker] Starting generateSuperGlobule');
			const startTime = performance.now();

			const superGlobule = generateSuperGlobule(payload);

			const endTime = performance.now();
			console.log(`[Worker] generateSuperGlobule completed in ${endTime - startTime}ms`);

			// Strip non-serializable parts before posting
			const serializableResult = stripNonSerializable(superGlobule);

			const response: WorkerResponse = {
				type: 'result',
				payload: serializableResult,
				requestId
			};

			self.postMessage(response);
		} catch (error) {
			console.error('[Worker] Error generating SuperGlobule:', error);
			const response: WorkerResponse = {
				type: 'error',
				error: error instanceof Error ? error.message : 'Unknown error',
				requestId
			};
			self.postMessage(response);
		}
	}
};
