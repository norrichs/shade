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

/**
 * Assembler pane dividers, as fractions of the page: `left` and `right` are the
 * x-positions of the model|band and band|pattern dividers, `top` is the
 * y-position of the divider above the data pane.
 */
export type AssemblerPanels = { left: number; right: number; top: number };

export const DEFAULT_ASSEMBLER_PANELS: AssemblerPanels = { left: 0.4, right: 0.6, top: 0.7 };

const MIN_ROW_FRACTION = 0.15;
const MAX_TOP_FRACTION = 0.9;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Keep every Assembler pane at least `MIN_PANEL_FRACTION` wide and the rows
 * within [0.15, 0.9]. The `moved` divider is clamped against its neighbours,
 * which stay where they are unless they are themselves out of range (a stale
 * stored layout).
 */
export const clampAssemblerPanels = (
	p: AssemblerPanels,
	moved: 'left' | 'right' | 'top'
): AssemblerPanels => {
	const min = MIN_PANEL_FRACTION;
	const top = clamp(p.top, MIN_ROW_FRACTION, MAX_TOP_FRACTION);
	if (moved === 'right') {
		const right = clamp(p.right, Math.max(p.left, min) + min, 1 - min);
		return { left: clamp(p.left, min, right - min), right, top };
	}
	const left = clamp(p.left, min, Math.min(p.right, 1 - min) - min);
	return { left, right: clamp(p.right, left + min, 1 - min), top };
};

export const assemblerPanels = persistable<AssemblerPanels>(
	DEFAULT_ASSEMBLER_PANELS,
	'AssemblerPanels',
	AUTO_PERSIST_KEY,
	true
);

export const nextPanelLayout =(layout: PanelLayout): PanelLayout => {
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

/**
 * How the 3D model is drawn: `model` colours every band as usual; `selection`
 * draws only the selected / pattern-filtered bands solid and ghosts the rest.
 */
export type ModelRenderMode = 'model' | 'selection';
export const modelRenderMode = persistable<ModelRenderMode>(
	'model',
	'ModelRenderMode',
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
