import { AUTO_PERSIST_KEY, persistable } from '#lib/persistable.js';

export type ComputationMode = 'continuous' | '3d-only' | '2d-only';

/** Which designer panes are visible, left to right. */
export type PanelLayout = 'model-pattern' | 'pattern-model' | 'model' | 'pattern';

const PANEL_LAYOUTS: { value: PanelLayout; label: string }[] = [
	{ value: 'model-pattern', label: 'Model | Pattern' },
	{ value: 'pattern-model', label: 'Pattern | Model' },
	{ value: 'model', label: 'Model' },
	{ value: 'pattern', label: 'Pattern' }
];

/** Every visible pane keeps at least this fraction of the viewport width. */
export const MIN_PANEL_FRACTION = 0.1;

export type DesignerPanels = {
	layout: PanelLayout;
	/** Fraction of the width given to the left pane when both are shown. */
	split: number;
};

const DEFAULT_DESIGNER_PANELS: DesignerPanels = { layout: 'model-pattern', split: 2 / 3 };

export const designerPanels = persistable<DesignerPanels>(
	DEFAULT_DESIGNER_PANELS,
	'DesignerPanels',
	AUTO_PERSIST_KEY,
	true
);

export const clampSplit = (split: number) =>
	Math.min(1 - MIN_PANEL_FRACTION, Math.max(MIN_PANEL_FRACTION, split));

export const nextPanelLayout = (layout: PanelLayout): PanelLayout => {
	const i = PANEL_LAYOUTS.findIndex((l) => l.value === layout);
	return PANEL_LAYOUTS[(i + 1) % PANEL_LAYOUTS.length].value;
};

export const panelLayoutLabel = (layout: PanelLayout) =>
	PANEL_LAYOUTS.find((l) => l.value === layout)?.label ?? layout;

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

// When true, OrbitControls is disabled so pointer events can't be claimed as camera
// orbits — every click reaches the facet meshes for band selection/inspection.
// Ephemeral (debug tooling); reset to false on reload so the camera is never left locked.
export const selectModeActive = writable(false);

// Manual mode: prevents auto-updates, requires explicit trigger via "Regenerate" button
export const isManualMode = persistable<boolean>(false, 'ManualMode', AUTO_PERSIST_KEY, true);

// Track whether config has changed since last regeneration (ephemeral - doesn't persist)
export const hasPendingChanges = writable<boolean>(false);
