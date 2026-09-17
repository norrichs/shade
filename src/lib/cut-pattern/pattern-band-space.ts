/**
 * Pattern band addresses ↔ 3D band addresses.
 *
 * Cut-pattern addresses (`BandCutPattern.address`, the assembler highlight, the
 * tile editor's partner highlight) are in PATTERN band space; 3D tube arrays,
 * facet addresses and the per-source selection stores are in REAL band space
 * (see `pattern-band-index.ts`). Every site that crosses between the pattern
 * pane and the 3D view maps through these helpers, using a `BandSpace` built by
 * `bandSpaceForTubes` from the same tubes, with the same fill-band rule, that
 * pattern generation used. With every band visible and no fill bands filtered
 * the mapping is the identity.
 *
 * Pieces: the 3D view has no pieces, so a piece maps to its parent's real band
 * (`piece` dropped). Facet-level addresses are expected in parent quad
 * coordinates already (`partnerHighlightAddresses` does that step).
 */
import type {
	GlobuleAddress_Band,
	GlobuleAddress_BandPiece,
	GlobuleAddress_Facet,
	Tube
} from '$lib/projection-geometry/types';
import type { PatternSource, PatternTypeConfig } from '$lib/types';
import { isOutlinedPatternConfig } from '$lib/types';
import { toggleAssemblerHighlight, type AssemblerHighlight } from '$lib/assembler-highlight';
import type { GeometrySource } from '$lib/stores/selectionStores';
import type { PartnerHighlightSource } from '$lib/stores/partnerHighlightStore';
import { buildBandSpace, patternedTubes, type BandSpace } from './pattern-band-index';

export type { BandSpace };

/** Whether this pattern type keeps fillAll's fill bands (outlined only). */
export const keepsFillBands = (patternTypeConfig: PatternTypeConfig): boolean =>
	isOutlinedPatternConfig(patternTypeConfig);

/** The band space of a pattern generated from `tubes`; undefined without tubes. */
export const bandSpaceForTubes = (
	tubes: Tube[] | undefined,
	keepFillBands: boolean
): BandSpace | undefined =>
	tubes ? buildBandSpace(patternedTubes(tubes, keepFillBands)) : undefined;

/** The 3D geometry source a pattern source was generated from. */
export const geometrySourceOfPattern = (source: PatternSource): GeometrySource =>
	source === 'globule' ? 'globuleTube' : source;

/** The 3D geometry source behind a tile-editor partner highlight source. */
export const geometrySourceOfPartnerHighlight = (source: PartnerHighlightSource): GeometrySource =>
	source === 'surface' ? 'surfaceProjection' : source;

type BandAddress = GlobuleAddress_Band | GlobuleAddress_BandPiece;

/** The real 3D band a pattern band or piece is cut from; null when it has none. */
export const patternBandToReal = (
	space: BandSpace | undefined,
	address: BandAddress
): GlobuleAddress_Band | null => {
	const band = space?.toReal(address.tube, address.band);
	return band === undefined ? null : { globule: address.globule, tube: address.tube, band };
};

/** A parent-quad pattern facet address on its real 3D band; null when it has none. */
export const patternFacetToReal = (
	space: BandSpace | undefined,
	address: GlobuleAddress_Facet
): GlobuleAddress_Facet | null => {
	const band = patternBandToReal(space, address);
	return band ? { ...band, facet: address.facet } : null;
};

/**
 * The 3D facet selection for a clicked pattern band or piece: its real band, at
 * the first triangle of the piece (quad `parentQuadOffset`, triangles 2k, 2k+1).
 */
export const patternBandSelectionToReal = (
	space: BandSpace | undefined,
	band: { address: BandAddress; parentQuadOffset?: number }
): GlobuleAddress_Facet | null => {
	const real = patternBandToReal(space, band.address);
	return real ? { ...real, facet: (band.parentQuadOffset ?? 0) * 2 } : null;
};

/** The pattern band a real 3D band was patterned as; null when hidden or filtered out. */
export const realBandToPattern = (
	space: BandSpace | undefined,
	address: GlobuleAddress_Band
): GlobuleAddress_Band | null => {
	const band = space?.toPattern(address.tube, address.band);
	return band === undefined ? null : { globule: address.globule, tube: address.tube, band };
};

/**
 * The assembler highlight (pattern space) on one 3D source's bands. Ring members
 * with no real band are dropped; null when the highlighted band itself has none.
 */
export const assemblerHighlightToReal = (
	space: BandSpace | undefined,
	highlight: AssemblerHighlight
): AssemblerHighlight => {
	if (!highlight) return null;
	const band = patternBandToReal(space, highlight.band);
	if (!band) return null;
	const ring = highlight.ring
		.map((member) => patternBandToReal(space, member))
		.filter((member): member is GlobuleAddress_Band => !!member);
	return { source: highlight.source, band, ring };
};

/** Looks up the band space of one 3D geometry source's pattern. */
export type PatternBandSpaceOf = (
	source: GeometrySource,
	globule?: number
) => BandSpace | undefined;

/**
 * The band-space facts a pattern generation recorded (`PatternGenerationResult`).
 * Plain data, so it survives the worker round trip.
 */
export type GeneratedBandSpaceFacts = { keepsFillBands: boolean };

/**
 * Pattern ↔ real band space for each 3D geometry source, under the fill-band rule
 * the GENERATED pattern used. Generation can lag the config (paused updates,
 * manual mode with pending changes), and the pane shows the generated pattern, so
 * the config's current pattern type must not decide the mapping. Built lazily,
 * once per source and globule.
 */
export const patternBandSpaceLookup = (
	tubesOf: (source: GeometrySource, globule: number) => Tube[] | undefined,
	generated: GeneratedBandSpaceFacts
): PatternBandSpaceOf => {
	const cache = new Map<string, BandSpace | undefined>();
	return (source, globule = 0) => {
		const key = `${source}:${globule}`;
		if (!cache.has(key))
			cache.set(key, bandSpaceForTubes(tubesOf(source, globule), generated.keepsFillBands));
		return cache.get(key);
	};
};

/**
 * The assembler highlight as one 3D source's meshes should draw it: null unless
 * the highlight belongs to that source, otherwise mapped through its band space.
 * A highlight names bands in its own source's pattern space, which means nothing
 * on another source's tubes.
 */
export const assemblerHighlightOnSource = (
	spaceOf: PatternBandSpaceOf,
	highlight: AssemblerHighlight,
	source: GeometrySource
): AssemblerHighlight =>
	highlight && highlight.source === source
		? assemblerHighlightToReal(spaceOf(source, highlight.band.globule), highlight)
		: null;

/** The assembler highlight as the pattern pane should draw it: only the pattern source's. */
export const assemblerHighlightInPattern = (
	highlight: AssemblerHighlight,
	patternSource: PatternSource
): AssemblerHighlight =>
	highlight && highlight.source === geometrySourceOfPattern(patternSource) ? highlight : null;

/**
 * The ring for a highlight on `source`. The ring lookup is built from the pattern
 * pane's tubes, so it only applies to the current pattern source; any other
 * source highlights the band alone.
 */
export const assemblerHighlightRing = (
	source: GeometrySource,
	patternSource: PatternSource,
	ringOf: (band: GlobuleAddress_Band) => GlobuleAddress_Band[],
	band: GlobuleAddress_Band
): GlobuleAddress_Band[] => (source === geometrySourceOfPattern(patternSource) ? ringOf(band) : []);

/**
 * The assembler highlight after a 3D click on a real band of `source`. The band
 * is mapped to its pattern band; a band that was never patterned (hidden, or a
 * fill band a tiled pattern drops) clears the highlight, so a stale highlight does
 * not read as the click's result. Otherwise the usual toggle applies.
 */
export const assemblerHighlightForRealClick = (
	current: AssemblerHighlight,
	source: GeometrySource,
	space: BandSpace | undefined,
	address: GlobuleAddress_Band,
	ringOf: (band: GlobuleAddress_Band) => GlobuleAddress_Band[]
): AssemblerHighlight => {
	const band = realBandToPattern(space, address);
	return band ? toggleAssemblerHighlight(current, source, band, ringOf(band)) : null;
};
