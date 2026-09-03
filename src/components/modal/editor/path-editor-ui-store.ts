/**
 * Per-editor UI state for `PathEditor`.
 *
 * This lives at module scope rather than in component `$state` because `Floater`
 * fully remounts its panel content whenever a floater is closed or switched — a
 * component-local toggle would silently reset every time the user looked away.
 *
 * Keyed by `editorId`. An editor that passes no id keeps its state local and
 * never writes here, so unkeyed instances cannot bleed into one another.
 */
import { writable } from 'svelte/store';

export type PointInputMode = 'inline' | 'outrigger';

export type PathEditorUiState = {
	showPointInputs: boolean;
	pointInputMode: PointInputMode;
};

export const defaultPathEditorUiState = (): PathEditorUiState => ({
	showPointInputs: false,
	pointInputMode: 'inline'
});

export const pathEditorUiStore = writable<Record<string, PathEditorUiState>>({});

export const setPathEditorUiState = (editorId: string, patch: Partial<PathEditorUiState>) => {
	pathEditorUiStore.update((state) => ({
		...state,
		[editorId]: { ...defaultPathEditorUiState(), ...state[editorId], ...patch }
	}));
};
