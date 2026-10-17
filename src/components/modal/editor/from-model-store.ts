import { writable } from 'svelte/store';
import type { SuperGlobuleConfig } from '#lib/types.js';
import type { ImportedSurfaceConfig } from '#lib/projection-geometry/types.js';

// Module stores: floater panels unmount on close, so state that must survive that lives here.

export const fromModelOpen = writable(false);

/** The band count (N) typed into the From model section; undefined = use the primary GCS's. */
export const fromModelBandCount = writable<number | undefined>(undefined);

/** Errors and warnings from the last snapshot. */
export const fromModelMessages = writable<{ errors: string[]; warnings: string[] }>({
	errors: [],
	warnings: []
});

/** The model to slice: the globule's modelSource, else the projection surface if imported. */
export function defaultModelSource(config: SuperGlobuleConfig): ImportedSurfaceConfig | undefined {
	const own = config.subGlobuleConfigs[0]?.globuleConfig.modelSource;
	if (own) return own;
	const surface = config.projectionConfigs[0]?.surfaceConfig;
	return surface?.type === 'ImportedMeshConfig' ? (surface as ImportedSurfaceConfig) : undefined;
}
