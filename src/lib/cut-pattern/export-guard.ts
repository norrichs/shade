import { isGeometryType } from './post-process-types';

export type ExportNode = { tag: string; geometry: string | null; describe: string };

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

/** DOM adapter. `root` should already have screen-only nodes removed (a clone). */
export const collectExportNodes = (root: Element): ExportNode[] =>
	Array.from(root.querySelectorAll(EXPORTED_TAGS.join(','))).map((el) => {
		const parentId = el.closest('[id]')?.id;
		return {
			tag: el.tagName.toLowerCase(),
			geometry: el.getAttribute('data-geometry'),
			describe: `${el.tagName.toLowerCase()}${parentId ? ` in #${parentId}` : ''}`
		};
	});
