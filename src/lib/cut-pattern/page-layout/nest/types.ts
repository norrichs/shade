export type Pt = { x: number; y: number };
/** Half-open run of set cells [x0, x1) within one raster row. */
export type Span = [number, number];
/**
 * A piece's cell coverage at one angle. Row i covers pivot-relative
 * y ∈ [(i + oy)·cell, (i + oy + 1)·cell); column c likewise with ox.
 * `area` is the UNdilated set-cell count (dilation keeps it).
 */
export type Raster = { w: number; h: number; rows: Span[][]; ox: number; oy: number; area: number };
/** A band's footprint: convex polygons in band-local pattern units, plus the rotation pivot. */
export type NestShape = { polygons: Pt[][]; pivot: Pt };
