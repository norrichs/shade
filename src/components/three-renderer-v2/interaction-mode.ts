import type { BandSelection } from '$lib/stores';
import type { Band, Id, Point3 } from '$lib/types';
import { writable } from 'svelte/store';

export type InteractionMode =
	| { type: 'standard' }
	| PointSelectInteractionMode
	| BandSelectInteractionMode;

export type PointSelectInteractionMode =
	| {
			type: 'point-select-plane';
			data: { pick: 3; points: Point3[] };
			onSelectPoint?: () => void;
	  }
	| {
			type: 'point-select-translate';
			data: { pick: 2; points: Point3[] };
			onSelectPoint?: () => void;
	  }
	| {
			type: 'point-select-rotate';
			data: { pick: 2; points: Point3[] };
			onSelectPoint?: () => void;
	  }
	| {
			type: 'point-select-axis';
			data: { pick: 2; points: Point3[] };
			onSelectPoint?: () => void;
	  }
	| {
			type: 'point-select-anchor';
			data: { pick: 1; points: Point3[] };
			onSelectPoint?: () => void;
	  };

export type BandSelectInteractionMode =
	| {
			type: 'band-select-partners';
			data: {
				pick: 1;
				originHighlight: BandSelection[];
				originSelected: BandSelection | undefined;
				partnerHighlight: BandSelection[];
				partnerSelected: BandSelection | undefined;
			};
			onSelectBands: () => void;
	  }
	| {
			type: 'band-select';
			data: {
				pick: 2;
				bands: BandSelection[];
			};
	  }
	| {
			type: 'band-select-multiple';
			data: {
				bands: BandSelection[];
			};
	  };

export const isPointSelectInteractionMode = (
	mode: InteractionMode
): mode is PointSelectInteractionMode => mode.type.startsWith('point-select');
export const isBandSelectInteractionMode = (
	mode: InteractionMode
): mode is BandSelectInteractionMode => mode.type.startsWith('band-select');

export const interactionMode = writable<InteractionMode>({ type: 'standard' });

export type Interaction = { prompt: string; buttonPrompt: string; buttonReady: string };

export const interactions: {
	[key: string]: Interaction;
} = {
	'point-select-translate': {
		prompt: 'Pick two points to define offset.\nSecond point is destination',
		buttonPrompt: 'Pick',
		buttonReady: 'Apply'
	},
	'point-select-rotate': {
		prompt: 'Pick two points to define rotation anchor and axis',
		buttonPrompt: 'Pick',
		buttonReady: 'Apply'
	},
	'point-select-axis': {
		prompt: 'Pick two points to define an axis of rotation',
		buttonPrompt: 'Pick',
		buttonReady: 'Apply'
	},
	'point-select-anchor': {
		prompt: 'Pick one point to define rotation anchor',
		buttonPrompt: 'Pick',
		buttonReady: 'Apply'
	},
	'point-select-plane': {
		prompt: 'Pick three points to define a plane',
		buttonPrompt: 'Pick',
		buttonReady: 'Apply'
	},
	'band-select-partners': {
		prompt: 'Pick two touching bands',
		buttonPrompt: 'Pick',
		buttonReady: 'Apply'
	},
	'band-select-multiple': {
		prompt: 'Pick bands to highlight',
		buttonPrompt: 'Dismiss',
		buttonReady: 'Dismiss'
	}
};
