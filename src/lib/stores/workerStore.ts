import { writable, derived, type Readable } from 'svelte/store';
import type { SuperGlobuleConfig, SuperGlobule, PipelineGates } from '$lib/types';
import type { Tube } from '$lib/projection-geometry/types';
import type {
	WorkerMessage,
	WorkerResponse,
	PatternMessage
} from '$lib/workers/super-globule-worker-core';
import type { PatternGenerationConfig } from './globulePatternStores';
import type { PatternGenerationResult } from '$lib/cut-pattern/run-pattern-generation';
import { rehydratePatternResult } from '$lib/workers/rehydrate-pattern';
import { Vector3, Triangle } from 'three';
import {
	generateSurface,
	prepareProjectionConfig
} from '$lib/projection-geometry/generate-projection';

// Store to track if the worker is currently processing
export const isWorking = writable<boolean>(false);

// Store to track if there's an error
export const workerError = writable<string | null>(null);

// True while a 2D pattern request is in flight in the worker.
export const isPatternWorking = writable<boolean>(false);

/**
 * Which worker `generate` request produced a given SuperGlobule instance. A
 * pattern request names this id so the worker can build the pattern from the
 * geometry it already holds instead of receiving it again. Geometry that did not
 * come from the worker (SSR, tests) has no entry and is patterned on the caller's
 * thread.
 */
export const geometryRequestIds = new WeakMap<SuperGlobule, number>();

/** The worker no longer holds the geometry a pattern request named. Callers drop the request. */
export class StalePatternError extends Error {
	constructor(message = 'pattern request referenced geometry the worker no longer holds') {
		super(message);
		this.name = 'StalePatternError';
	}
}

const pendingPatternResolvers: Map<
	number,
	{ resolve: (value: PatternGenerationResult) => void; reject: (reason: Error) => void }
> = new Map();

// Internal state for request tracking
let requestIdCounter = 0;
let worker: Worker | null = null;
const pendingResolvers: Map<
	number,
	{
		resolve: (value: SuperGlobule) => void;
		reject: (reason: Error) => void;
		config: SuperGlobuleConfig;
	}
> = new Map();

/**
 * Recursively rehydrates plain objects back into Three.js instances
 * This is needed because postMessage serializes class instances to plain objects
 */
function rehydrateVector3(obj: { x: number; y: number; z: number }): Vector3 {
	return new Vector3(obj.x, obj.y, obj.z);
}

function rehydrateTriangle(obj: {
	a: { x: number; y: number; z: number };
	b: { x: number; y: number; z: number };
	c: { x: number; y: number; z: number };
}): Triangle {
	return new Triangle(rehydrateVector3(obj.a), rehydrateVector3(obj.b), rehydrateVector3(obj.c));
}

/**
 * Rehydrates the SuperGlobule result from the worker
 * Converts plain objects back to Three.js Vector3 and Triangle instances
 */
function rehydrateSuperGlobule(result: SuperGlobule): SuperGlobule {
	// Rehydrate projections
	const projections = result.projections.map((projection) => ({
		...projection,
		polyhedron: {
			polygons: projection.polyhedron.polygons.map((polygon) => ({
				edges: polygon.edges.map((edge) => ({
					...edge,
					edgePoints: edge.edgePoints.map(rehydrateVector3),
					curvePoints: edge.curvePoints.map(rehydrateVector3)
				}))
			}))
		},
		projection: {
			...projection.projection,
			polygons: projection.projection.polygons.map((polygon) => ({
				edges: polygon.edges.map((edge) => ({
					...edge,
					sections: edge.sections.map((section) => ({
						...section,
						intersections: {
							edge: rehydrateVector3(section.intersections.edge),
							curve: rehydrateVector3(section.intersections.curve),
							divisions: (section.intersections.divisions || []).map(rehydrateVector3)
						},
						crossSectionPoints: section.crossSectionPoints.map(rehydrateVector3)
					}))
				}))
			}))
		},
		tubes: projection.tubes.map((tube) => ({
			...tube,
			sections: tube.sections.map((section) => ({
				points: section.points.map(rehydrateVector3)
			})),
			bands: tube.bands.map((band) => ({
				...band,
				facets: band.facets.map((facet) => ({
					...facet,
					triangle: rehydrateTriangle(
						facet.triangle as unknown as Parameters<typeof rehydrateTriangle>[0]
					)
				}))
			}))
		})),
		surfaceProjectionTubes: (projection.surfaceProjectionTubes || []).map((tube) => ({
			...tube,
			sections: tube.sections.map((section) => ({
				points: section.points.map(rehydrateVector3)
			})),
			bands: tube.bands.map((band) => ({
				...band,
				facets: band.facets.map((facet) => ({
					...facet,
					triangle: rehydrateTriangle(
						facet.triangle as unknown as Parameters<typeof rehydrateTriangle>[0]
					)
				}))
			}))
		}))
	}));

	// Rehydrate globuleTubes
	const globuleTubes = result.globuleTubes.map((tube) => ({
		...tube,
		sections: tube.sections.map((section) => ({
			points: section.points.map(rehydrateVector3)
		})),
		bands: tube.bands.map((band) => ({
			...band,
			facets: band.facets.map((facet) => ({
				...facet,
				triangle: rehydrateTriangle(
					facet.triangle as unknown as Parameters<typeof rehydrateTriangle>[0]
				)
			}))
		}))
	}));

	// Rehydrate subGlobules
	const subGlobules = result.subGlobules.map((subGlobule) => ({
		...subGlobule,
		data: subGlobule.data.map((globule) => ({
			...globule,
			data: {
				...globule.data,
				levels:
					globule.data.levels?.map((level) => ({
						...level,
						center: rehydrateVector3(
							level.center as unknown as Parameters<typeof rehydrateVector3>[0]
						),
						vertices: level.vertices.map(rehydrateVector3 as unknown as (v: Vector3) => Vector3)
					})) ?? [],
				bands: globule.data.bands.map((band) => ({
					...band,
					facets: band.facets.map((facet) => ({
						...facet,
						triangle: rehydrateTriangle(
							facet.triangle as unknown as Parameters<typeof rehydrateTriangle>[0]
						)
					}))
				}))
			}
		}))
	}));

	const rehydrateTubes = (tubes: Tube[]) =>
		tubes.map((tube) => ({
			...tube,
			sections: tube.sections.map((section) => ({
				points: section.points.map(rehydrateVector3)
			})),
			bands: tube.bands.map((band) => ({
				...band,
				facets: band.facets.map((facet) => ({
					...facet,
					triangle: rehydrateTriangle(
						facet.triangle as unknown as Parameters<typeof rehydrateTriangle>[0]
					)
				}))
			}))
		}));

	// Rehydrate voronoiResult (single)
	const voronoiResult = result.voronoiResult
		? {
				...result.voronoiResult,
				tubes: rehydrateTubes(result.voronoiResult.tubes),
				surfaceProjectionTubes: rehydrateTubes(result.voronoiResult.surfaceProjectionTubes ?? [])
			}
		: undefined;

	return {
		...result,
		projections,
		globuleTubes,
		subGlobules,
		voronoiResult
	};
}

/**
 * Gets or creates the worker instance
 */
function getWorker(): Worker {
	if (!worker) {
		// Vite handles the worker bundling with this syntax
		worker = new Worker(new URL('$lib/workers/super-globule.worker.ts', import.meta.url), {
			type: 'module'
		});

		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const data = event.data;

			if (
				data.type === 'pattern-result' ||
				data.type === 'pattern-error' ||
				data.type === 'pattern-stale'
			) {
				const resolver = pendingPatternResolvers.get(data.requestId);
				pendingPatternResolvers.delete(data.requestId);
				if (pendingPatternResolvers.size === 0) isPatternWorking.set(false);
				if (!resolver) {
					console.warn('[WorkerStore] Received pattern response for unknown request:', data.requestId);
					return;
				}
				if (data.type === 'pattern-result') {
					resolver.resolve(rehydratePatternResult(data.payload));
				} else if (data.type === 'pattern-stale') {
					resolver.reject(new StalePatternError());
				} else {
					resolver.reject(new Error(data.error));
				}
				return;
			}

			const { type, requestId } = data;
			const resolver = pendingResolvers.get(requestId);

			if (!resolver) {
				console.warn('[WorkerStore] Received response for unknown request:', requestId);
				return;
			}

			pendingResolvers.delete(requestId);

			// Check if there are no more pending requests
			if (pendingResolvers.size === 0) {
				isWorking.set(false);
			}

			if (type === 'result') {
				const rehydrated = rehydrateSuperGlobule(data.payload);
				geometryRequestIds.set(rehydrated, requestId);

				// Non-fatal per-pipeline failures: surface them as a warning (the toast
				// subscriber reads workerError) but still resolve with the partial result
				// so the pipelines that succeeded still render.
				const pipelineErrors = rehydrated.pipelineErrors ?? [];
				workerError.set(
					pipelineErrors.length > 0
						? pipelineErrors.map((e) => `${e.pipeline}: ${e.message}`).join('; ')
						: null
				);

				// Regenerate surfaces on main thread (Object3D can't be serialized through worker)
				resolver.config.projectionConfigs.forEach((projConfig, i) => {
					if (rehydrated.projections[i]) {
						const prepared = prepareProjectionConfig(JSON.parse(JSON.stringify(projConfig)));
						rehydrated.projections[i].surface = generateSurface(prepared.surfaceConfig);
					}
				});

				// Regenerate Voronoi surface (uses projection's surface config)
				const projSurfaceConfig = resolver.config.projectionConfigs[0]?.surfaceConfig;
				const voronoiConfig = resolver.config.voronoiConfig;
				if (projSurfaceConfig && voronoiConfig && rehydrated.voronoiResult) {
					const plainSurfaceConfig = JSON.parse(JSON.stringify(projSurfaceConfig));
					const resolvedSurfaceConfig =
						plainSurfaceConfig.transform === 'inherit'
							? { ...plainSurfaceConfig, transform: voronoiConfig.meta.transform }
							: plainSurfaceConfig;
					rehydrated.voronoiResult.surface = generateSurface(resolvedSurfaceConfig);
				}

				resolver.resolve(rehydrated);
			} else if (type === 'error') {
				workerError.set(data.error);
				resolver.reject(new Error(data.error));
			}
		};

		worker.onerror = (error) => {
			console.error('[WorkerStore] Worker error:', error);
			workerError.set(error.message);
			isWorking.set(false);

			// Reject all pending requests
			pendingResolvers.forEach((resolver) => {
				resolver.reject(new Error(error.message));
			});
			pendingResolvers.clear();
			pendingPatternResolvers.forEach((resolver) => resolver.reject(new Error(error.message)));
			pendingPatternResolvers.clear();
			isPatternWorking.set(false);
		};
	}

	return worker;
}

/**
 * Generates a SuperGlobule using the web worker
 * Returns a promise that resolves with the result
 */
export function generateSuperGlobuleAsync(
	config: SuperGlobuleConfig,
	gates: PipelineGates
): Promise<SuperGlobule> {
	return new Promise((resolve, reject) => {
		const requestId = ++requestIdCounter;

		pendingResolvers.set(requestId, { resolve, reject, config });
		isWorking.set(true);
		workerError.set(null);

		const message: WorkerMessage = {
			type: 'generate',
			payload: config,
			gates,
			requestId
		};

		try {
			const w = getWorker();
			// Deep clone to strip any Svelte 5 $state proxy objects
			// which cannot be transferred via postMessage
			w.postMessage(JSON.parse(JSON.stringify(message)));
		} catch (error) {
			pendingResolvers.delete(requestId);
			isWorking.set(false);
			workerError.set(error instanceof Error ? error.message : 'Failed to start worker');
			reject(error);
		}
	});
}

/**
 * Generates the 2D patterns for `geometry` in the worker. `geometry` must be a
 * SuperGlobule the worker produced (see `geometryRequestIds`); otherwise the
 * promise rejects with a StalePatternError and the caller should generate on its
 * own thread. Rejects with StalePatternError too when the worker has since moved
 * on to newer geometry, in which case the caller simply drops the request.
 */
export function generatePatternAsync(
	geometry: SuperGlobule,
	superConfig: SuperGlobuleConfig,
	genConfig: PatternGenerationConfig,
	gates: PipelineGates
): Promise<PatternGenerationResult> {
	const geometryRequestId = geometryRequestIds.get(geometry);
	if (geometryRequestId === undefined) {
		return Promise.reject(new StalePatternError('geometry was not produced by the worker'));
	}
	return new Promise((resolve, reject) => {
		const requestId = ++requestIdCounter;
		pendingPatternResolvers.set(requestId, { resolve, reject });
		isPatternWorking.set(true);

		const message: PatternMessage = {
			type: 'pattern',
			requestId,
			geometryRequestId,
			superConfig,
			genConfig,
			gates
		};

		try {
			// Deep clone to strip any Svelte 5 $state proxy objects
			getWorker().postMessage(JSON.parse(JSON.stringify(message)));
		} catch (error) {
			pendingPatternResolvers.delete(requestId);
			if (pendingPatternResolvers.size === 0) isPatternWorking.set(false);
			reject(error instanceof Error ? error : new Error('Failed to post pattern request'));
		}
	});
}

/**
 * Terminates the worker (useful for cleanup)
 */
export function terminateWorker(): void {
	if (worker) {
		worker.terminate();
		worker = null;
		pendingResolvers.clear();
		pendingPatternResolvers.clear();
		isWorking.set(false);
		isPatternWorking.set(false);
	}
}
