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
};

/**
 * Splits configured for one tube, found by tube number.
 *
 * Mirrors `generateProjectionPattern`'s `splitQuadsFor`: an absent entry means
 * "no splits", which is the documented no-op path.
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
 * Geometry needs no new math: quad k+1's `a`/`b` ARE quad k's `d`/`c`, so a
 * boundary is the previous quad's far (d→c) edge, and a piece's leading seam —
 * which has no previous quad here — is its own first quad's near (a→b) edge.
 */
export const splitBoundariesOfBand = (
	band: Pick<BandCutPattern, 'facets' | 'parentQuadOffset'>,
	subunitCount: number,
	splitQuads: number[]
): SplitBoundary[] => {
	const quads = band.facets.filter((facet) => !!facet.quad).map((facet) => facet.quad!);
	// 0 on an uncut band: its quads already are the parent's.
	const offset = band.parentQuadOffset ?? 0;
	const boundaries: SplitBoundary[] = [];
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
	return boundaries;
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
			tubeSplits: toggleTubeSplits(config.patternConfig.splits?.tubeSplits ?? [], tube, quad)
		}
	}
});
