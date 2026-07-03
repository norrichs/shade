/**
 * Shared highlight palette for the Assembler page. The 3D view, pattern view,
 * and data grid all read from here so a band highlighted in one view reads as
 * the same colour in the others.
 *
 * - PRIMARY: the band the user clicked in the data grid.
 * - SECONDARY: the other bands in that band's ring.
 *
 * Kept distinct from the data grid's Tube# filter highlight (light blue).
 */
export const HIGHLIGHT_PRIMARY = '#ff3b30';
export const HIGHLIGHT_SECONDARY = '#ffb3ae';
