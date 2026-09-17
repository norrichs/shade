/**
 * Assembler-page band-highlight type and equality helper.
 *
 * Kept in a leaf module (no store imports) so low-level consumers like the 3D
 * renderer's `materials.ts` can use them without pulling in the whole store
 * graph — importing these from `selectionStores` creates an import cycle that
 * trips a temporal-dead-zone error on `superConfigStore` at module init.
 *
 * The reactive `assemblerHighlight` store and its setter live in
 * `stores/selectionStores.ts`, which re-exports these for convenience.
 */
import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
import { concatAddress_Band } from '$lib/util';
import type { GeometrySource } from '$lib/stores/selectionStores';

/**
 * Assembler-page highlight state. Set by clicking a member cell in the data
 * grid; read by the 3D view (band materials) and the pattern view (band bounds
 * fill) so the three views stay in sync.
 *
 * - `source`: the 3D geometry source whose pattern band space `band` and `ring`
 *   are in. Each source's meshes draw only their own source's highlight (mapped
 *   through its band space); the pattern pane draws it only when `source` is the
 *   current pattern source.
 * - `band`: the clicked band, drawn in the primary highlight colour.
 * - `ring`: every band in that band's ring (incl. `band`); the non-`band`
 *   members draw in the secondary highlight colour. Empty in modes without
 *   rings (e.g. tube-order), where only the single band is highlighted.
 */
export type AssemblerHighlight = {
	source: GeometrySource;
	band: GlobuleAddress_Band;
	ring: GlobuleAddress_Band[];
} | null;

/** Equality for band addresses ({globule, tube, band}). */
export const sameGlobuleBand = (a: GlobuleAddress_Band, b: GlobuleAddress_Band): boolean =>
	concatAddress_Band(a) === concatAddress_Band(b);

/**
 * Highlight `band` of `source` (with its `ring`). Clicking the already-highlighted
 * band of the same source clears the highlight; anything else replaces it.
 */
export const toggleAssemblerHighlight = (
	current: AssemblerHighlight,
	source: GeometrySource,
	band: GlobuleAddress_Band,
	ring: GlobuleAddress_Band[]
): AssemblerHighlight =>
	current && current.source === source && sameGlobuleBand(current.band, band)
		? null
		: { source, band, ring };
