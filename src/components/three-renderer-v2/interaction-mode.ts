import type { Point3 } from '$lib/types';
import { writable } from 'svelte/store';

export type InteractionMode = { type: 'standard' } | PointSelectInteractionMode;

export type PointSelectInteractionMode =
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

export const isPointSelectInteractionMode = (mode: InteractionMode): mode is PointSelectInteractionMode =>
	mode.type.startsWith('point-select');

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
	}
};
