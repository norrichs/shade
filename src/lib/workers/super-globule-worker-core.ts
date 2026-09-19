import { generateSuperGlobule as defaultGenerateSuperGlobule } from '$lib/generate-superglobule';
import {
	runPatternGeneration as defaultRunPatternGeneration,
	type PatternGenerationResult
} from '$lib/cut-pattern/run-pattern-generation';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type { PipelineGates, SuperGlobule, SuperGlobuleConfig } from '$lib/types';

/**
 * Message protocol between the main thread and the geometry worker.
 *
 * `generate` runs the 3D pipeline. The worker keeps the resulting SuperGlobule
 * (with live Three.js objects) so a later `pattern` request can run against it
 * without shipping the geometry back and forth; the request only carries the
 * small config inputs plus the id of the geometry it expects to find.
 */
export type GenerateMessage = {
	type: 'generate';
	payload: SuperGlobuleConfig;
	/** Which pipelines to run, derived from the viewControl `any` flags. */
	gates: PipelineGates;
	requestId: number;
};

export type PatternMessage = {
	type: 'pattern';
	requestId: number;
	/** requestId of the `generate` whose result this pattern should be built from. */
	geometryRequestId: number;
	superConfig: SuperGlobuleConfig;
	genConfig: PatternGenerationConfig;
	gates: PipelineGates;
};

export type WorkerMessage = GenerateMessage | PatternMessage;

export type WorkerResponse =
	| { type: 'result'; payload: SuperGlobule; requestId: number }
	| { type: 'error'; error: string; requestId: number }
	| {
			type: 'pattern-result';
			payload: PatternGenerationResult;
			requestId: number;
			durationMs: number;
	  }
	| { type: 'pattern-error'; error: string; requestId: number }
	/** The worker no longer holds the geometry the request named; the caller should drop the request. */
	| {
			type: 'pattern-stale';
			requestId: number;
			geometryRequestId: number;
			heldGeometryRequestId: number | null;
	  };

export type WorkerCoreDeps = {
	generateSuperGlobule: typeof defaultGenerateSuperGlobule;
	runPatternGeneration: typeof defaultRunPatternGeneration;
	/** Strip Object3D and other non-transferable parts before posting. */
	stripNonSerializable: (superGlobule: SuperGlobule) => SuperGlobule;
	now: () => number;
	log: (message: string) => void;
};

/**
 * Strips non-serializable Object3D instances from the result
 * The surface can be regenerated on the main thread if needed
 */
export function stripNonSerializable(superGlobule: SuperGlobule): SuperGlobule {
	return {
		...superGlobule,
		projections: superGlobule.projections.map((projection) => ({
			...projection,
			// Replace Object3D with null - it can't be serialized
			// and can be regenerated on main thread if needed
			surface: null as unknown as typeof projection.surface
		})),
		// Strip end cap meshes from subGlobules
		subGlobules: superGlobule.subGlobules.map((subGlobule) => ({
			...subGlobule,
			data: subGlobule.data.map((globule) => ({
				...globule,
				data: {
					...globule.data,
					// Strip end cap meshes - they contain non-serializable Three.js objects
					endCaps: globule.data.endCaps
						? {
								topCap: globule.data.endCaps.topCap
									? {
											...globule.data.endCaps.topCap,
											mesh: null as never
										}
									: null,
								bottomCap: globule.data.endCaps.bottomCap
									? {
											...globule.data.endCaps.bottomCap,
											mesh: null as never
										}
									: null
							}
						: undefined
				}
			}))
		})),
		voronoiResult: superGlobule.voronoiResult
			? {
					...superGlobule.voronoiResult,
					surface: null as unknown as typeof superGlobule.voronoiResult.surface
				}
			: undefined
	};
}

export const createWorkerCore = (overrides: Partial<WorkerCoreDeps> = {}) => {
	const deps: WorkerCoreDeps = {
		generateSuperGlobule: defaultGenerateSuperGlobule,
		runPatternGeneration: defaultRunPatternGeneration,
		stripNonSerializable,
		now: () => performance.now(),
		log: (m) => console.log(m),
		...overrides
	};

	let held: { requestId: number; superGlobule: SuperGlobule } | null = null;

	const handle = (message: WorkerMessage, post: (response: WorkerResponse) => void) => {
		if (message.type === 'generate') {
			const { payload, gates, requestId } = message;
			try {
				deps.log('[Worker] Starting generateSuperGlobule');
				const start = deps.now();
				const superGlobule = deps.generateSuperGlobule(payload, gates);
				deps.log(`[Worker] generateSuperGlobule completed in ${deps.now() - start}ms`);
				held = { requestId, superGlobule };
				post({ type: 'result', payload: deps.stripNonSerializable(superGlobule), requestId });
			} catch (error) {
				post({
					type: 'error',
					error: error instanceof Error ? error.message : 'Unknown error',
					requestId
				});
			}
			return;
		}

		if (message.type === 'pattern') {
			const { requestId, geometryRequestId, superConfig, genConfig, gates } = message;
			if (!held || held.requestId !== geometryRequestId) {
				post({
					type: 'pattern-stale',
					requestId,
					geometryRequestId,
					heldGeometryRequestId: held?.requestId ?? null
				});
				return;
			}
			try {
				const start = deps.now();
				const payload = deps.runPatternGeneration({
					superGlobule: held.superGlobule,
					superConfig,
					genConfig,
					gates
				});
				const durationMs = deps.now() - start;
				deps.log(`[Worker] pattern generation completed in ${durationMs}ms`);
				post({ type: 'pattern-result', payload, requestId, durationMs });
			} catch (error) {
				post({
					type: 'pattern-error',
					error: error instanceof Error ? error.message : 'Unknown error',
					requestId
				});
			}
		}
	};

	return { handle, heldGeometryRequestId: () => held?.requestId ?? null };
};
