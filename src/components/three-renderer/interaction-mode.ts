import type { BandSelection } from '#lib/stores/index.js';
import type { Point3 } from '#lib/types.js';
import { writable } from 'svelte/store';

export type InteractionMode =
	| { type: 'standard' }
	| MeasureInteractionMode
	| BandSelectInteractionMode
	/**
	 * Clicks in the 2D pattern view place or remove a split at a quad boundary.
	 * 2D only: nothing in the 3D scene reacts to this mode.
	 */
	| { type: 'quad-split-select' };

/**
 * Measurement collects pairs rather than filling a fixed-size buffer: clicks on
 * the model are pushed straight into the measurements store (see
 * `selection-helpers.ts`), not into `data.points`.
 */
type MeasureInteractionMode = {
	type: 'point-select-measure';
	data: { pick: 2; points: Point3[] };
	onSelectPoint?: () => void;
};

/** Set by NavHeader's "Select Bands" button; PointPick shows its prompt. */
type BandSelectInteractionMode = {
	type: 'band-select-multiple';
	data: {
		bands: BandSelection[];
	};
};

export const isBandSelectInteractionMode = (
	mode: InteractionMode
): mode is BandSelectInteractionMode => mode.type.startsWith('band-select');

export const isMeasureInteractionMode = (mode: InteractionMode): mode is MeasureInteractionMode =>
	mode.type === 'point-select-measure';

export const interactionMode = writable<InteractionMode>({ type: 'standard' });

export type Interaction = { prompt: string; buttonPrompt: string; buttonReady: string };

export const interactions: {
	[key: string]: Interaction;
} = {
	'point-select-measure': {
		prompt: 'Click two points on the model to measure between them',
		buttonPrompt: 'Measure',
		buttonReady: 'Done'
	},
	'quad-split-select': {
		prompt: 'Click a quad boundary in the pattern view to place or remove a split',
		buttonPrompt: 'Place splits',
		buttonReady: 'Done'
	},
	'band-select-multiple': {
		prompt: 'Pick bands to highlight',
		buttonPrompt: 'Dismiss',
		buttonReady: 'Dismiss'
	}
};
