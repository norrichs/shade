import type { PathSegment } from '$lib/types';

export type Pt = { x: number; y: number };

/**
 * What a piece of exported geometry IS, assigned by whatever produces it.
 * Nothing downstream infers a type from color or shape; the layer mapping and
 * both exporters read only this tag (`data-geometry` in the DOM).
 */
export const GEOMETRY_TYPES = [
	'pattern-outline',
	'pattern-hole',
	'outline-gap',
	'surround-disconnect',
	'label-text',
	'page-label',
	'page-outline'
] as const;
export type GeometryType = (typeof GEOMETRY_TYPES)[number];

export const GEOMETRY_TYPE_LABELS: Record<GeometryType, string> = {
	'pattern-outline': 'Pattern outlines',
	'pattern-hole': 'Pattern holes',
	'outline-gap': 'Outline gaps',
	'surround-disconnect': 'Surround disconnects',
	'label-text': 'Label text',
	'page-label': 'Page labels',
	'page-outline': 'Page outlines'
};

export const isGeometryType = (v: unknown): v is GeometryType =>
	typeof v === 'string' && (GEOMETRY_TYPES as readonly string[]).includes(v);

/** One stroked piece of a band's prepared output. `contour` indexes `BandContourIndex.contours`. */
export type TaggedPath = { geometry: GeometryType; segments: PathSegment[]; contour?: number };

/** A band end, band-local. `outward` is a unit vector pointing away from the band. */
export type BandEnd = { point: Pt; outward: Pt };
export type BandEnds = { start: BandEnd; end: BandEnd };

/** Same semantics as `bandTransform(origin, rotation, pivot)`: rotate about pivot, then translate. */
export type Placement = { origin: Pt; rotation: number; pivot: Pt };

/** A prepared band in PAGE space, as stage 3 sees it. Polylines are closed or open point runs. */
export type PlacedBand = {
	bandId: string;
	page: number;
	outlines: Pt[][];
	holes: Pt[][];
	ends?: BandEnds;
};

export type Disconnect = {
	page: number;
	a: Pt;
	b: Pt;
	fromBand: string;
	/** Band the ray hit, or null when it hit the page edge. */
	toBand: string | null;
};

export type PageLabelResult = {
	page: number;
	text: string;
	/** SvgText anchor (glyph origin), page space. */
	origin: Pt;
	/** SvgText `size`. */
	size: number;
	unplaced?: boolean;
};

export type PagePostProcessResult = { disconnects: Disconnect[]; pageLabels: PageLabelResult[] };
