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

/**
 * Assembler-page highlight state. Set by clicking a member cell in the data
 * grid; read by the 3D view (band materials) and the pattern view (band bounds
 * fill) so the three views stay in sync.
 *
 * - `band`: the clicked band, drawn in the primary highlight colour.
 * - `ring`: every band in that band's ring (incl. `band`); the non-`band`
 *   members draw in the secondary highlight colour. Empty in modes without
 *   rings (e.g. tube-order), where only the single band is highlighted.
 */
export type AssemblerHighlight = {
	band: GlobuleAddress_Band;
	ring: GlobuleAddress_Band[];
} | null;

/** Equality for band addresses ({globule, tube, band}). */
export const sameGlobuleBand = (a: GlobuleAddress_Band, b: GlobuleAddress_Band): boolean =>
	concatAddress_Band(a) === concatAddress_Band(b);
