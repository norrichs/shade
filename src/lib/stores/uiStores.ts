import { AUTO_PERSIST_KEY, persistable } from '$lib/persistable';

export type ViewModeSetting = 'three' | 'pattern';

export type ComputationMode = 'continuous' | '3d-only' | '2d-only';

export type UISetting = {
	designer: { viewMode: ViewModeSetting };
};

export const uiStore = persistable<UISetting>(
	{ designer: { viewMode: 'three' } },
	'UISettings',
	AUTO_PERSIST_KEY,
	true
);

export const computationMode = persistable<ComputationMode>(
	'continuous',
	'ComputationMode',
	AUTO_PERSIST_KEY,
	true
);

// Flag to pause pattern updates (for manual control)
import { writable } from 'svelte/store';
export const pausePatternUpdates = writable(false);

// Track camera interaction for LOD (Level of Detail) optimization
// When camera is moving, we show simplified geometry for better performance
export const isCameraInteracting = writable(false);
