import type { PatternLabelsConfig } from '$lib/types';

/**
 * Label sizes are stored in real-world millimetres and resolved to pattern
 * units at the point of use, through `pageLayout.pageScale` (pattern units per
 * mm). Every layout mode resolves through the same scale, so a label is the
 * same size relative to the pattern in linear and line-wrap views as it is on
 * the page — and changing the page scale no longer resizes printed labels.
 *
 * Only lengths convert. `angle`, `enabled`, `externalTag` and `color` do not.
 */

type SelfTag = NonNullable<PatternLabelsConfig['selfTag']>;
type OnTab = NonNullable<PatternLabelsConfig['onTab']>;
type LengthDefaults = {
	height: number;
	padding: number;
	stemLength: number;
	stemWidth: number;
	onTabPadding: number;
};

/**
 * Defaults in mm. They are the old pixel defaults (14/10/20/4, on-tab 1) at the
 * default page scale (0.6562 units/mm), rounded, so a fresh config looks as it
 * did before labels moved to mm.
 */
export const LABEL_MM_DEFAULTS: Readonly<LengthDefaults> = {
	height: 21,
	padding: 15,
	stemLength: 30,
	stemWidth: 6,
	onTabPadding: 1.5
};

const scaleSelfTag = (tag: SelfTag, k: number, d: LengthDefaults): SelfTag => ({
	...tag,
	height: (tag.height ?? d.height) * k,
	padding: (tag.padding ?? d.padding) * k,
	stemLength: (tag.stemLength ?? d.stemLength) * k,
	stemWidth: (tag.stemWidth ?? d.stemWidth) * k
});

const scaleOnTab = (tab: OnTab, k: number, fallback: number): OnTab => ({
	...tab,
	padding: (tab.padding ?? fallback) * k
});

/** A usable page scale: a zero, negative or missing one (older configs) reads as 1:1. */
const usableScale = (pageScale: number | undefined): number =>
	pageScale && Number.isFinite(pageScale) && pageScale > 0 ? pageScale : 1;

/**
 * mm labels → pattern units, every length filled in. Consumers (render, layout
 * footprint, prepared merge) read only this, so they agree on one size.
 */
export const resolveLabelsToPatternUnits = (
	labels: PatternLabelsConfig | undefined,
	pageScale: number | undefined
): PatternLabelsConfig | undefined => {
	if (!labels) return undefined;
	const k = usableScale(pageScale);
	return {
		...labels,
		...(labels.onTab ? { onTab: scaleOnTab(labels.onTab, k, LABEL_MM_DEFAULTS.onTabPadding) } : {}),
		...(labels.selfTag ? { selfTag: scaleSelfTag(labels.selfTag, k, LABEL_MM_DEFAULTS) } : {})
	};
};

/** The pixel defaults the pre-mm pipeline filled missing fields with. */
const LEGACY_PX_DEFAULTS: Readonly<LengthDefaults> = {
	height: 14,
	padding: 10,
	stemLength: 20,
	stemWidth: 4,
	onTabPadding: 1
};

/**
 * One-time migration of pattern-unit ("px") labels to mm, at the config's own
 * page scale, so a saved config renders exactly as it did. Idempotent: labels
 * already marked `units: 'mm'` are returned unchanged.
 */
export const migrateLabelsToMm = (
	labels: PatternLabelsConfig,
	pageScale: number | undefined
): PatternLabelsConfig => {
	if (labels.units === 'mm') return labels;
	const k = 1 / usableScale(pageScale);
	return {
		...labels,
		units: 'mm',
		...(labels.onTab
			? { onTab: scaleOnTab(labels.onTab, k, LEGACY_PX_DEFAULTS.onTabPadding) }
			: {}),
		...(labels.selfTag ? { selfTag: scaleSelfTag(labels.selfTag, k, LEGACY_PX_DEFAULTS) } : {})
	};
};
