import type { BandCutPattern, PathSegment, Point, TubeCutPattern } from '$lib/types';
import type { LabelTextDims } from '$lib/stores/mergedPathStore';

/**
 * One band, reduced to exactly what merging and post-processing need, in a form
 * that survives `postMessage` without rehydration.
 *
 * `buildBandUnionPath` reads only `facet.path` and `facet.strokeWidth`; the
 * label outline needs the tag fields. Nothing here is a Three.js object, so —
 * unlike the pattern result, which needs `rehydrate-pattern.ts` — this crosses
 * the worker boundary intact.
 */
export type BandMergePayload = {
	id: string;
	facets: { path: PathSegment[]; strokeWidth?: number }[];
	tagAnchorPoint?: Point;
	tagAngle?: number;
	tagAnchorAutoAngle?: number;
	/**
	 * This band's span within its parent band, as fractions of the parent.
	 * An unsplit band is [0, 1]; the second of two equal pieces is [0.5, 1].
	 *
	 * A worker is handed one band in isolation, and a piece knows its own
	 * `parentQuadOffset` and `quadCount` but not its parent's total — that is
	 * only derivable by summing sibling pieces, which only the main thread can
	 * see. Post-processing needs it to place a hole along the parent band, so it
	 * is resolved here at extraction time.
	 */
	pieceStartFraction: number;
	pieceEndFraction: number;
	/** This band's measured label bbox; undefined means use the FALLBACK dims. */
	labelTextDims?: LabelTextDims;
	/** Deterministic per-band seed. Worker code must never call Math.random(). */
	seed: number;
};

/** FNV-1a over `${runSeed}:${bandId}`. Stable across runs, machines and reloads. */
export const seedForBand = (runSeed: number, bandId: string): number => {
	let hash = 0x811c9dc5;
	const input = `${runSeed}:${bandId}`;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
};

/** A band's quad count: the explicit field in split tubes, else its facet count. */
const quadsOf = (band: BandCutPattern): number => band.quadCount ?? band.facets.length;

/**
 * Per-band [start, end] fractions of the parent band, keyed by band id.
 *
 * Bands sharing an `address.band` within a tube are pieces of one parent. Their
 * quad counts sum to the parent's, and `parentQuadOffset` places each one.
 */
const parentSpans = (tubes: TubeCutPattern[]): Map<string, [number, number]> => {
	const spans = new Map<string, [number, number]>();
	for (const tube of tubes) {
		const byParent = new Map<number | string, BandCutPattern[]>();
		for (const band of tube.bands) {
			// A real BandCutPattern always has an address: it is required on the
			// type (types.ts:464) and set at every construction site, split pieces
			// included (generate-tiled-pattern.ts:366 and :571,
			// generate-outlined-pattern.ts:680-683). This branch exists only for
			// test fixtures cast with `as unknown as TubeCutPattern`, which omit
			// it; keying such a band by id makes it a group of one, yielding the
			// [0, 1] span the general fallback below would give it anyway.
			const key = band.address ? band.address.band : `no-address:${band.id}`;
			const group = byParent.get(key);
			if (group) group.push(band);
			else byParent.set(key, [band]);
		}
		for (const parts of byParent.values()) {
			const total = parts.reduce((sum, part) => sum + quadsOf(part), 0);
			for (const part of parts) {
				if (total <= 0) {
					spans.set(part.id, [0, 1]);
					continue;
				}
				const offset = part.parentQuadOffset ?? 0;
				spans.set(part.id, [offset / total, (offset + quadsOf(part)) / total]);
			}
		}
	}
	return spans;
};

/**
 * Flatten `tubes` into one payload per band, in tube-then-band order.
 *
 * Bands with no facets are dropped here rather than in the worker, so the pool
 * never spends a round trip on a band that cannot produce a path.
 */
export const toBandMergePayloads = (
	tubes: TubeCutPattern[],
	labelTextDims: Map<string, LabelTextDims>,
	runSeed = 0
): BandMergePayload[] => {
	const spans = parentSpans(tubes);
	const payloads: BandMergePayload[] = [];
	for (const tube of tubes) {
		for (const band of tube.bands) {
			if (!band.facets || band.facets.length === 0) continue;
			const [pieceStartFraction, pieceEndFraction] = spans.get(band.id) ?? [0, 1];
			payloads.push({
				id: band.id,
				facets: band.facets.map((facet) => ({
					path: facet.path,
					strokeWidth: facet.strokeWidth
				})),
				tagAnchorPoint: band.tagAnchorPoint
					? { x: band.tagAnchorPoint.x, y: band.tagAnchorPoint.y }
					: undefined,
				tagAngle: band.tagAngle,
				tagAnchorAutoAngle: band.tagAnchorAutoAngle,
				pieceStartFraction,
				pieceEndFraction,
				labelTextDims: labelTextDims.get(band.id),
				seed: seedForBand(runSeed, band.id)
			});
		}
	}
	return payloads;
};
