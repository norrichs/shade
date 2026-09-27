import { isGeometryType } from './post-process-types';

export type ExportNode = { tag: string; geometry: string | null; describe: string };

/**
 * Markup that exists for the screen only and must never reach the exported SVG.
 *
 * The export drives a cutter/plotter, so every serialised stroke is something
 * somebody has to cut:
 * - `.svg-pattern-quad` — the per-quad debug overlay (`QuadPattern.svelte`).
 * - `.split-target` — the split seam layer (`SplitTargets.svelte`): a grey
 *   dashed hairline on every legal boundary while split mode is on, a red one
 *   on every existing split, plus a transparent `.hit` line with
 *   `role="button"`/`tabindex`. Existing splits draw at all times, so without
 *   this the defect is worst exactly when the feature is in use.
 * - `.screen-only` — the band overlay rectangles: the bounds debug rect
 *   (`BoundsPattern.svelte` and `BandComponent.svelte`) and the assembler
 *   cross-view highlight. A filled rect over a whole band is the worst thing
 *   to hand a cutter, and the highlight follows the selection, so the export
 *   silently depended on which band was clicked last.
 *
 * Mark any new screen furniture with `screen-only` rather than adding another
 * selector here. Defined here (not in `util.ts`) so `collectExportNodes` can
 * enforce the same exclusion without a util↔export-guard import cycle;
 * `util.ts` re-exports it for its existing callers.
 */
export const SCREEN_ONLY_SELECTOR = '.svg-pattern-quad, .split-target, .screen-only';

/** Minimal shape `describeExportElement` needs — real DOM elements satisfy it. */
export type ExportElementLike = {
	tagName: string;
	getAttribute: (name: string) => string | null;
	closest: (selector: string) => unknown;
};

/**
 * Pure per-element mapping used by `collectExportNodes`, pulled out so it is
 * testable without a real DOM: a fake object implementing `ExportElementLike`
 * exercises the `.screen-only` exclusion (via `closest`) without jsdom.
 * Returns `null` for an element inside a screen-only subtree.
 */
export const describeExportElement = (el: ExportElementLike): ExportNode | null => {
	if (el.closest(SCREEN_ONLY_SELECTOR)) return null;
	const parentId = (el.closest('[id]') as { id?: string } | null)?.id;
	const tag = el.tagName.toLowerCase();
	return {
		tag,
		geometry: el.getAttribute('data-geometry'),
		describe: `${tag}${parentId ? ` in #${parentId}` : ''}`
	};
};

export const EXPORTED_TAGS = [
	'path',
	'rect',
	'line',
	'polyline',
	'polygon',
	'circle',
	'ellipse',
	'text'
] as const;

/**
 * Drawables without a valid `data-geometry`. Such an element would land on an
 * arbitrary LightBurn layer and cut at the wrong setting, so exports refuse it.
 */
export const findUntagged = (nodes: ExportNode[]): ExportNode[] =>
	nodes.filter(
		(n) => (EXPORTED_TAGS as readonly string[]).includes(n.tag) && !isGeometryType(n.geometry)
	);

export const untaggedMessage = (bad: ExportNode[]): string =>
	`Export blocked: ${bad.length} untagged element${bad.length === 1 ? '' : 's'} ` +
	`(${bad
		.slice(0, 5)
		.map((b) => b.describe)
		.join(', ')}${bad.length > 5 ? ', …' : ''}).`;

/** DOM adapter. Excludes any element inside a `.screen-only`-style subtree. */
export const collectExportNodes = (root: Element): ExportNode[] =>
	Array.from(root.querySelectorAll(EXPORTED_TAGS.join(',')))
		.map((el) => describeExportElement(el as unknown as ExportElementLike))
		.filter((n): n is ExportNode => n !== null);
