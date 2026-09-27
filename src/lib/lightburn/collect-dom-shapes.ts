import type { PathSegment } from '$lib/types';
import { isGeometryType } from '$lib/cut-pattern/post-process-types';
import { SCREEN_ONLY_SELECTOR } from '$lib/cut-pattern/export-guard';
import { parsePathD, applyMatrix, type Matrix } from '$lib/download/parse-path-d';
import { toCubicSegments } from './lbrn2-path';
import type { ExportShape } from './build-lb-project';

const toMatrix = (m: DOMMatrix): Matrix => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f });

const rectSegments = (el: SVGRectElement): PathSegment[] => {
	const x = el.x.baseVal.value;
	const y = el.y.baseVal.value;
	const w = el.width.baseVal.value;
	const h = el.height.baseVal.value;
	return [
		['M', x, y],
		['L', x + w, y],
		['L', x + w, y + h],
		['L', x, y + h],
		['Z']
	];
};

/**
 * Every tagged drawable under the LIVE `root` (`#pattern-svg`), in root user
 * space (pattern units, page space). Matrices come from the live layout, which
 * is why this reads the document rather than a clone: a detached clone has no
 * CTM. Screen-only subtrees and hidden elements are skipped. Call it only after
 * the untagged guard has passed.
 */
export const collectDomShapes = (root: SVGSVGElement): ExportShape[] => {
	const rootInverse = root.getScreenCTM()?.inverse();
	if (!rootInverse) return [];
	const shapes: ExportShape[] = [];
	root.querySelectorAll('path[data-geometry], rect[data-geometry]').forEach((node) => {
		const el = node as SVGGraphicsElement;
		if (el.closest(SCREEN_ONLY_SELECTOR)) return;
		const geometry = el.getAttribute('data-geometry');
		if (!isGeometryType(geometry)) return;
		const style = getComputedStyle(el);
		if (style.display === 'none' || style.visibility === 'hidden') return;
		const ctm = el.getScreenCTM();
		if (!ctm) return;
		const local =
			el.tagName.toLowerCase() === 'rect'
				? rectSegments(el as SVGRectElement)
				: parsePathD(el.getAttribute('d') ?? '');
		const segments = applyMatrix(toCubicSegments(local), toMatrix(rootInverse.multiply(ctm)));
		shapes.push({ geometry, segments });
	});
	return shapes;
};
