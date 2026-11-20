/**
 * Split sections: the runs of quads between a tube's split cuts, as the pattern
 * Range lists them with a checkbox each (`patternViewConfig.hiddenSplitSections`).
 *
 * A section is keyed by its tube and first (parent) quad. Splits are tube-wide,
 * so every piece starting at that quad — whichever band it comes from — lies in
 * that section, and a piece's `parentQuadOffset` names its section. Uncut bands
 * (absent offset) sit in the first section. Store-free so it can be unit tested.
 */
import type { GlobuleAddress_Tube } from '#lib/projection-geometry/types.js';
import type { TubeCutPattern } from '#lib/types.js';

export const splitSectionKey = (a: GlobuleAddress_Tube, parentQuadOffset = 0): string =>
	`${a.globule}:${a.tube}@${parentQuadOffset}`;

export type SplitSection = {
	key: string;
	globule: number;
	tube: number;
	/** 0-based ordinal of the section within its tube. */
	index: number;
	/** First parent quad of the section. */
	startQuad: number;
	/** Last parent quad of the section, inclusive; undefined for the last section. */
	endQuad?: number;
	/** How many pattern bands (pieces or uncut bands) lie in the section. */
	bandCount: number;
};

/**
 * The sections of the split tubes in `tubes`, in tube then quad order. Read from
 * the generated pieces rather than the split config, so a split generation
 * dropped never lists an empty section. Unsplit tubes list nothing.
 */
export const listSplitSections = (tubes: TubeCutPattern[]): SplitSection[] =>
	tubes.flatMap((tube) => {
		if (!tube.bands.some((b) => b.parentQuadOffset !== undefined)) return [];
		const counts = new Map<number, number>();
		for (const band of tube.bands) {
			const offset = band.parentQuadOffset ?? 0;
			counts.set(offset, (counts.get(offset) ?? 0) + 1);
		}
		const offsets = [...counts.keys()].sort((a, b) => a - b);
		return offsets.map((startQuad, index) => ({
			key: splitSectionKey(tube.address, startQuad),
			globule: tube.address.globule,
			tube: tube.address.tube,
			index,
			startQuad,
			endQuad: index + 1 < offsets.length ? offsets[index + 1] - 1 : undefined,
			bandCount: counts.get(startQuad) ?? 0
		}));
	});

/**
 * `tubes` without the bands in `hidden` sections. Tubes left with no band are
 * dropped. Returns `tubes` itself when nothing is hidden, so layout memos keyed
 * on identity hold.
 */
export const hideSplitSections = (
	tubes: TubeCutPattern[],
	hidden: string[] | undefined
): TubeCutPattern[] => {
	if (!hidden?.length) return tubes;
	const set = new Set(hidden);
	return tubes.flatMap((tube) => {
		const bands = tube.bands.filter(
			(band) => !set.has(splitSectionKey(tube.address, band.parentQuadOffset))
		);
		if (bands.length === 0) return [];
		return bands.length === tube.bands.length ? [tube] : [{ ...tube, bands }];
	});
};
