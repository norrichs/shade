import { writable } from 'svelte/store';

/**
 * View → "Pattern on model": the cut pattern rasterised onto the 3D bands it was
 * cut from (see `pattern-on-model/`). Screen-only; never part of a saved config.
 */
export type PatternOnModelConfig = {
	enabled: boolean;
	/** Texture texels per pattern unit. Memory grows with its square. */
	density: number;
	/** Dim the room and light the model from a point inside it, casting the lattice. */
	interiorLight: boolean;
};

export const patternOnModelStore = writable<PatternOnModelConfig>({
	enabled: false,
	density: 2,
	interiorLight: false
});
