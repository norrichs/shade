import { resolvePatternEntry } from '$lib/patterns/resolve-pattern';
import {
	isOutlinedPatternConfig,
	type BandCutPattern,
	type GlobulePatternConfig,
	type PatternTypeConfig,
	type UnitPatternGenerator,
	type Point,
	type SplitConfig,
	type TubeSplits
} from '$lib/types';

/**
 * The click targets the split-placing interaction offers on one band.
 *
 * `quad` is an ABSOLUTE (parent) quad index — the space a split is persisted in
 * (`TubeSplits.quads`) — so a piece of an already-split band reports the parent
 * indices its own quads occupy, never its piece-local 0..n-1. Identity is by
 * that index, never by position in `facets` or in the tube's band array
 * (spec amendment, "Neighbour identity is by address, never by array position").
 */
export type SplitBoundary = {
	/** Absolute parent quad index the cut would fall before. */
	quad: number;
	from: Point;
	to: Point;
	/** True when a split already sits here, so clicking removes it. */
	isSplit: boolean;
	/**
	 * Stroke width, in pattern units, for this boundary's transparent hit line.
	 * Per-boundary rather than fixed, because bands taper (see HIT_WIDTH_FACTOR).
	 */
	hitWidth: number;
};

/** The comfortable hit width where a band has room for it. */
export const MAX_HIT_WIDTH = 12;

/**
 * The narrowest a hit zone is allowed to get, so a very dense band stays
 * clickable at all.
 *
 * It is a floor, so it wins over the spacing rule below `MIN_HIT_WIDTH /
 * HIT_WIDTH_FACTOR` = 2.5 units of spacing, and two zones may abut there. That
 * is deliberate — an unclickable target is worse than a slightly ambiguous one —
 * and it is below the real distribution: measured over 840 boundary gaps on the
 * 90-quad hexparquet config, the minimum gap was 2.82 and the 5th percentile
 * 3.89, so the floor does not engage on real geometry.
 */
export const MIN_HIT_WIDTH = 2;

/**
 * Fraction of the distance to the NEAREST neighbouring boundary a hit zone may
 * occupy. Below 1 by construction: two adjacent zones then sum to at most 0.8 of
 * the gap between them, so they cannot overlap and a click always toggles the
 * hairline it was aimed at.
 */
export const HIT_WIDTH_FACTOR = 0.8;

/**
 * Splits configured for one tube, found by tube number.
 *
 * The single home for this lookup: `generateProjectionPattern` and
 * `generateOutlinedProjectionPattern` both call it, and so does the pattern view.
 * This module is worker-safe — it imports nothing from Svelte — which is why it
 * can be the canonical one.
 *
 * An absent entry yields an empty array, which is `splitFlatBands`' documented
 * no-op path.
 */
export const splitQuadsForTube = (splits: SplitConfig | undefined, tube: number): number[] =>
	splits?.tubeSplits.find((t) => t.tube === tube)?.quads ?? [];

/**
 * The `subunitCount` split legality is judged against, resolved exactly the way
 * generation resolves it (`generate-pattern.ts:151,323`): 1 for the outlined
 * pipeline, and the registered entry's count for a tiled one.
 *
 * Outlined is special-cased rather than handed to `resolvePatternEntry`, which
 * has no `'outlined'` entry and would answer with a console warning and the
 * default tiled pattern. There is exactly one `patternTypeConfig` for every tube
 * (`types.ts:1429`), so this value is tube-independent.
 */
export const resolveSplitSubunitCount = (patternTypeConfig: PatternTypeConfig): number =>
	isOutlinedPatternConfig(patternTypeConfig)
		? 1
		: ((resolvePatternEntry(patternTypeConfig.type) as UnitPatternGenerator).subunitCount ?? 1);

/**
 * Every legal split position on `band`, as a line across it.
 *
 * Legality is the same rule `classifySplitQuads` enforces during generation —
 * strictly inside the band and a multiple of `subunitCount` — applied to the
 * band's own quads, so an illegal position has no target and cannot be clicked
 * at all. One target per boundary, not per quad corner.
 *
 * Quads are taken from the facets that actually carry one, because the
 * facet→quad alignment differs per family: tiled output is one facet per quad,
 * outlined output is `[outline, ...quads(, fill)]`, and a `DynamicPathCollection`
 * tiled band collapses to a single facet. Filtering handles all three, the same
 * idiom `QuadLabels.svelte` uses.
 *
 * KNOWN GAP, deliberate: a tiled pattern whose `getPattern` returns a
 * `DynamicPathCollection` produces ONE facet for the whole band
 * (`generate-tiled-pattern.ts:396-398`, `:409` — `mappedPatternBand` is a
 * single-element array), and that facet carries no per-quad `quad`. Such a band
 * therefore offers no click targets at all, even though generation can still
 * split it: `splitFlatBands` cuts the 3D `Band`, whose facets are intact,
 * before any pattern is mapped. Splits on those patterns stay a config-level
 * operation (Task 16's panel) until the boundary geometry is sourced from
 * somewhere other than the mapped facets.
 *
 * Geometry needs no new math: quad k+1's `a`/`b` ARE quad k's `d`/`c`, so a
 * boundary is the previous quad's far (d→c) edge, and a piece's leading seam —
 * which has no previous quad here — is its own first quad's near (a→b) edge.
 *
 * Hit width is sized per boundary from the local spacing, because bands taper:
 * near a band's ends adjacent boundaries can sit under 3 pattern units apart, so
 * a fixed 12-unit zone would overlap its neighbours and the later-painted one
 * would win, toggling a split one or more quads from the hairline the user aimed
 * at. See `HIT_WIDTH_FACTOR` / `MIN_HIT_WIDTH`.
 */
export const splitBoundariesOfBand = (
	band: Pick<BandCutPattern, 'facets' | 'parentQuadOffset'>,
	subunitCount: number,
	splitQuads: number[]
): SplitBoundary[] => {
	const quads = band.facets.filter((facet) => !!facet.quad).map((facet) => facet.quad!);
	// 0 on an uncut band: its quads already are the parent's.
	const offset = band.parentQuadOffset ?? 0;
	const boundaries: Omit<SplitBoundary, 'hitWidth'>[] = [];
	for (let i = 0; i < quads.length; i++) {
		const quad = offset + i;
		// quad 0 is the start of the whole band, not a boundary inside it. Every
		// other i === 0 is a piece's leading seam, which IS a split and must stay
		// clickable so it can be removed.
		if (quad === 0) continue;
		if (quad % subunitCount !== 0) continue;
		const edge =
			i > 0 ? { from: quads[i - 1].d, to: quads[i - 1].c } : { from: quads[0].a, to: quads[0].b };
		boundaries.push({
			quad,
			from: { x: edge.from.x, y: edge.from.y },
			to: { x: edge.to.x, y: edge.to.y },
			isSplit: splitQuads.includes(quad)
		});
	}

	// Spacing is measured between boundary midpoints, which is the distance along
	// the band axis even where a tapering band's boundaries are not parallel.
	const midpoints = boundaries.map((b) => ({
		x: (b.from.x + b.to.x) / 2,
		y: (b.from.y + b.to.y) / 2
	}));
	const gapTo = (i: number, j: number) =>
		j < 0 || j >= midpoints.length
			? Infinity
			: Math.hypot(midpoints[i].x - midpoints[j].x, midpoints[i].y - midpoints[j].y);

	return boundaries.map((boundary, i) => ({
		...boundary,
		hitWidth: Math.max(
			MIN_HIT_WIDTH,
			Math.min(MAX_HIT_WIDTH, HIT_WIDTH_FACTOR * Math.min(gapTo(i, i - 1), gapTo(i, i + 1)))
		)
	}));
};

/**
 * Toggle one split on one tube, returning a fresh list.
 *
 * Splits are stored per tube, so this applies tube-wide at once: propagation is
 * a consequence of the addressing, not a separate action. A tube whose last
 * split is removed loses its entry entirely, which is what "no splits" means to
 * generation. Pure — the input list and its entries are never touched.
 */
export const toggleTubeSplits = (
	tubeSplits: TubeSplits[],
	tube: number,
	quad: number
): TubeSplits[] => {
	const quads = tubeSplits.find((t) => t.tube === tube)?.quads ?? [];
	const next = quads.includes(quad)
		? quads.filter((q) => q !== quad)
		: [...quads, quad].sort((a, b) => a - b);
	return [
		...tubeSplits.filter((t) => t.tube !== tube),
		...(next.length ? [{ tube, quads: next }] : [])
	].sort((a, b) => a.tube - b.tube);
};

/**
 * The whole config with one split toggled, rebuilding every object on the edited
 * path — new root, new `patternConfig`, new `splits`, new `tubeSplits`.
 *
 * A panel reading through a `$derived` chain goes stale when a step returns the
 * same reference (design L396-402; cf. `PageLayout.svelte:20-26`), so the caller
 * hands this to `patternConfigStore.set(...)` rather than assigning in place.
 * The persisted list is only ever toggled, never pruned of splits generation
 * dropped (spec amendment, "Dropped splits are reported, data is untouched").
 */
export const applySplitToggle = (
	config: GlobulePatternConfig,
	tube: number,
	quad: number
): GlobulePatternConfig => ({
	...config,
	patternConfig: {
		...config.patternConfig,
		splits: {
			// Spread, not replace: `SplitConfig` gains sibling fields in Tasks 15/16,
			// and a click must not erase them.
			...config.patternConfig.splits,
			tubeSplits: toggleTubeSplits(config.patternConfig.splits?.tubeSplits ?? [], tube, quad)
		}
	}
});

/**
 * Proposed splits merged INTO the existing ones, per tube.
 *
 * A union, never a replacement. The spec's decision is that auto-split
 * materialises into the list and is thereafter plain hand data (design L35,
 * L520); nothing in it authorises discarding hand-placed splits, so nothing
 * here does. It stays idempotent because proposals are derived from PARENT
 * bands (`auto-split-bands.ts`), so running it twice on an unchanged pattern
 * proposes the same positions and the second union is a no-op.
 *
 * Result is ascending and deduplicated per tube, and ascending by tube — the
 * shape `TubeSplits` promises. Pure: neither input list nor its entries are
 * touched.
 */
export const unionTubeSplits = (
	tubeSplits: TubeSplits[],
	proposals: TubeSplits[]
): TubeSplits[] => {
	const merged = new Map<number, number[]>();
	for (const entry of tubeSplits) merged.set(entry.tube, [...entry.quads]);
	for (const entry of proposals) {
		merged.set(entry.tube, [...(merged.get(entry.tube) ?? []), ...entry.quads]);
	}
	return [...merged.entries()]
		.map(([tube, quads]) => ({ tube, quads: [...new Set(quads)].sort((a, b) => a - b) }))
		.filter((entry) => entry.quads.length > 0)
		.sort((a, b) => a.tube - b.tube);
};

/**
 * The whole config with auto-split proposals unioned in, rebuilding every
 * object on the edited path — the same idiom as `applySplitToggle`, for the
 * same reason (design L396-402).
 */
export const applyAutoSplits = (
	config: GlobulePatternConfig,
	proposals: TubeSplits[]
): GlobulePatternConfig => ({
	...config,
	patternConfig: {
		...config.patternConfig,
		splits: {
			...config.patternConfig.splits,
			tubeSplits: unionTubeSplits(config.patternConfig.splits?.tubeSplits ?? [], proposals)
		}
	}
});

/**
 * The whole config with every split removed.
 *
 * The one deliberate, explicit way to discard splits — which is exactly why the
 * union above never does it silently. This is a user action on a button, not a
 * prune during generation: splits generation merely DROPPED are still never
 * removed from the persisted list (spec amendment, "Dropped splits are
 * reported, data is untouched").
 */
export const clearAllSplits = (config: GlobulePatternConfig): GlobulePatternConfig => ({
	...config,
	patternConfig: {
		...config.patternConfig,
		splits: { ...config.patternConfig.splits, tubeSplits: [] }
	}
});
