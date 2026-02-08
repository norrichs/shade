import { writable, derived, type Readable } from 'svelte/store';
import type { SuperGlobuleConfig, SuperGlobule } from '$lib/types';
import type { WorkerMessage, WorkerResponse } from '$lib/workers/super-globule.worker';
import { Vector3, Triangle } from 'three';
import { generateSurface, prepareProjectionConfig } from '$lib/projection-geometry/generate-projection';

// Store to track if the worker is currently processing
export const isWorking = writable<boolean>(false);

// Store to track if there's an error
export const workerError = writable<string | null>(null);

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
							curve: rehydrateVector3(section.intersections.curve)
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

	return {
		...result,
		projections,
		globuleTubes,
		subGlobules
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
			const { type, requestId } = event.data;
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
				workerError.set(null);
				const rehydrated = rehydrateSuperGlobule(event.data.payload);

				// Regenerate surfaces on main thread (Object3D can't be serialized through worker)
				resolver.config.projectionConfigs.forEach((projConfig, i) => {
					if (rehydrated.projections[i]) {
						const prepared = prepareProjectionConfig(structuredClone(projConfig));
						rehydrated.projections[i].surface = generateSurface(prepared.surfaceConfig);
					}
				});

				resolver.resolve(rehydrated);
			} else if (type === 'error') {
				workerError.set(event.data.error);
				resolver.reject(new Error(event.data.error));
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
		};
	}

	return worker;
}

/**
 * Generates a SuperGlobule using the web worker
 * Returns a promise that resolves with the result
 */
export function generateSuperGlobuleAsync(config: SuperGlobuleConfig): Promise<SuperGlobule> {
	return new Promise((resolve, reject) => {
		const requestId = ++requestIdCounter;

		pendingResolvers.set(requestId, { resolve, reject, config });
		isWorking.set(true);
		workerError.set(null);

		const message: WorkerMessage = {
			type: 'generate',
			payload: config,
			requestId
		};

		try {
			const w = getWorker();
			w.postMessage(message);
		} catch (error) {
			pendingResolvers.delete(requestId);
			isWorking.set(false);
			workerError.set(error instanceof Error ? error.message : 'Failed to start worker');
			reject(error);
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
		isWorking.set(false);
	}
}
