import type { GlobuleAddress_Band, GlobuleAddress_BandPiece } from '$lib/projection-geometry/types';
import type { BandCutPattern, TubeCutPattern } from '$lib/types';
import { isGlobuleAddress_BandPiece, isSameAddress } from '$lib/util';
import {
	findSideNeighbourInBands,
	outerEndPartnerAmong,
	pieceIndexOf,
	type BandEnd
} from './resolve-partner-band';

/**
 * One tube's bands grouped by parent band, for naming the exact physical piece
 * on labels and in the CSV (spec amendment 2026-09-16, "Labels name the physical
 * piece").
 *
 * Built in one pass over the tube's bands, plus one pass over each band's facets
 * when the tube holds a split band: O(bands + facets). Every lookup after that
 * touches only one parent's pieces, so labelling a whole pattern stays linear
 * in its bands rather than rescanning the tube per tab.
 */

type BandAddress = GlobuleAddress_Band | GlobuleAddress_BandPiece;

/** The shape the index reads; `BandCutPattern` satisfies it. */
export type PieceIndexedBand = {
	address: BandAddress;
	parentQuadOffset?: number;
	facets?: { quad?: unknown }[];
};

/** Inclusive parent-quad range a band covers. */
export type QuadRange = { first: number; last: number };

export type TubePieceIndex<B extends PieceIndexedBand> = {
	/** Parent bands in first-appearance order; each is its bands in piece order. */
	parents: B[][];
	/** Parent band key → position in `parents`. */
	parentPosition: Map<string, number>;
	/**
	 * Each band's parent-quad range. Only filled when the tube holds a split
	 * band: with every parent a single band, no lookup ever consults a range.
	 */
	ranges: Map<B, QuadRange>;
};

const parentKey = (a: BandAddress): string => `${a.globule}:${a.tube}:${a.band}`;

/**
 * The parent quads `band` covers: from `parentQuadOffset` (0 for an uncut band)
 * over its quad count. Both tiled output (one facet per quad) and outlined
 * output (the outline, one facet per quad, optional fill) mark quad facets with
 * `quad`, so the count is the number of those. Undefined when none are present.
 */
export const quadRangeOf = (band: PieceIndexedBand): QuadRange | undefined => {
	let count = 0;
	for (const facet of band.facets ?? []) if (facet?.quad) count++;
	if (count === 0) return undefined;
	const first = band.parentQuadOffset ?? 0;
	return { first, last: first + count - 1 };
};

export const buildTubePieceIndex = <B extends PieceIndexedBand>(bands: B[]): TubePieceIndex<B> => {
	const parents: B[][] = [];
	const parentPosition = new Map<string, number>();
	for (const band of bands) {
		const key = parentKey(band.address);
		let position = parentPosition.get(key);
		if (position === undefined) {
			position = parents.length;
			parentPosition.set(key, position);
			parents.push([]);
		}
		parents[position].push(band);
	}
	const ranges = new Map<B, QuadRange>();
	if (parents.some((parent) => parent.length > 1)) {
		for (const parent of parents) {
			parent.sort((a, b) => pieceIndexOf(a.address) - pieceIndexOf(b.address));
		}
		for (const band of bands) {
			const range = quadRangeOf(band);
			if (range) ranges.set(band, range);
		}
	}
	return { parents, parentPosition, ranges };
};

// Keyed by the band array itself. Pattern results are replaced, never mutated in
// place, once generation hands them to the renderer, so a cached index cannot go
// stale; a regenerated pattern brings new arrays and new entries.
const indexCache = new WeakMap<object, TubePieceIndex<PieceIndexedBand>>();

/** `buildTubePieceIndex`, memoised per band array (for the render path). */
export const tubePieceIndex = <B extends PieceIndexedBand>(bands: B[]): TubePieceIndex<B> => {
	let index = indexCache.get(bands);
	if (!index) {
		index = buildTubePieceIndex(bands);
		indexCache.set(bands, index);
	}
	return index as TubePieceIndex<B>;
};

/** `band`'s parent's bands in piece order, or undefined when it is not indexed. */
export const parentBandsOf = <B extends PieceIndexedBand>(
	index: TubePieceIndex<B>,
	address: BandAddress
): B[] | undefined => {
	const position = index.parentPosition.get(parentKey(address));
	return position === undefined ? undefined : index.parents[position];
};

/** Whether a band with exactly `address` is in the index. */
export const hasBand = <B extends PieceIndexedBand>(
	index: TubePieceIndex<B>,
	address: BandAddress
): boolean => !!parentBandsOf(index, address)?.some((b) => isSameAddress(b.address, address));

/**
 * The bands of the parent one PARENT band before (`step` -1) or after (+1)
 * `address`'s parent, in the index's first-appearance order. Past either end:
 * wraps when `wrap`, otherwise undefined. The same parent order as
 * `findAdjacentSideNeighbour`.
 */
export const adjacentParentBands = <B extends PieceIndexedBand>(
	index: TubePieceIndex<B>,
	address: BandAddress,
	step: -1 | 1,
	wrap: boolean
): B[] | undefined => {
	const position = index.parentPosition.get(parentKey(address));
	if (position === undefined) return undefined;
	const count = index.parents.length;
	const target = position + step;
	if (!wrap && (target < 0 || target >= count)) return undefined;
	return index.parents[(count + target) % count];
};

/** The side-neighbour rule (same piece index, else last piece) over one parent. */
const sameIndexPiece = <B extends PieceIndexedBand>(neighbour: B[], self: PieceIndexedBand): B => {
	const { globule, tube, band } = neighbour[0].address;
	return (
		findSideNeighbourInBands(neighbour, { globule, tube, band }, pieceIndexOf(self.address)) ??
		neighbour[neighbour.length - 1]
	);
};

/**
 * The band of `neighbour` (one parent's bands) alongside `parentQuad`: the piece
 * whose parent-quad range contains it. An unsplit neighbour is itself. When the
 * quad is unknown or no piece covers it, falls back to the side-neighbour rule.
 */
export const neighbourPieceAtQuad = <B extends PieceIndexedBand>(
	index: TubePieceIndex<B>,
	neighbour: B[],
	self: PieceIndexedBand,
	parentQuad: number | undefined
): B => {
	if (neighbour.length === 1) return neighbour[0];
	if (parentQuad !== undefined) {
		const hit = neighbour.find((b) => {
			const range = index.ranges.get(b);
			return !!range && range.first <= parentQuad && parentQuad <= range.last;
		});
		if (hit) return hit;
	}
	return sameIndexPiece(neighbour, self);
};

/**
 * Every band of `neighbour` (one parent's bands) that `self` borders along its
 * length, in piece order: those whose parent-quad range overlaps `self`'s. An
 * unsplit neighbour is itself. When ranges are unknown or none overlap, falls
 * back to the single side-neighbour-rule piece.
 */
export const neighbourPiecesAlongside = <B extends PieceIndexedBand>(
	index: TubePieceIndex<B>,
	neighbour: B[],
	self: B
): B[] => {
	if (neighbour.length === 1) return neighbour;
	const own = index.ranges.get(self);
	if (own) {
		const hits = neighbour.filter((b) => {
			const range = index.ranges.get(b);
			return !!range && range.first <= own.last && own.first <= range.last;
		});
		if (hits.length > 0) return hits;
	}
	return [sameIndexPiece(neighbour, self)];
};

/** The tube `address` is in: `tubes[address.tube]` when that matches, else a search. */
export const tubeOfAddress = (
	tubes: TubeCutPattern[],
	address: BandAddress
): TubeCutPattern | undefined => {
	const direct = tubes[address.tube];
	if (direct?.address?.tube === address.tube && direct.address.globule === address.globule) {
		return direct;
	}
	return tubes.find(
		(t) => t.address?.tube === address.tube && t.address.globule === address.globule
	);
};

/**
 * The address naming the physical part at `band`'s `end`, or undefined when that
 * end has no partner.
 *
 * - A piece-bearing stored address is a seam and already exact.
 * - A plain one is an outer end partner, resolved by the end-partner rule over
 *   the partner's parent (`outerEndPartnerAmong`): piece 0 when its start joins,
 *   the last piece when its end joins. When the partner is not among `tubes` or
 *   is unsplit, the stored address is returned as is, so unsplit output is
 *   unchanged.
 */
export const endPartnerPieceAddress = (
	band: BandCutPattern,
	end: BandEnd,
	lookup: (address: BandAddress) => BandCutPattern[] | undefined
): BandAddress | undefined => {
	const stored = end === 'start' ? band.meta?.startPartnerBand : band.meta?.endPartnerBand;
	if (!stored || isGlobuleAddress_BandPiece(stored)) return stored;
	const resolved = outerEndPartnerAmong(lookup(stored) ?? [], band)?.band.address;
	return resolved && isGlobuleAddress_BandPiece(resolved) ? resolved : stored;
};
