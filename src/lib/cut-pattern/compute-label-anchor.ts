import type { Point } from '$lib/types';

/**
 * Inputs to `computeOutlinedLabelAnchor`.
 *
 * `edgeStart` / `edgeEnd` are the two endpoints of the start-cap edge in the
 * flattened band's 2D coordinate space (z is ignored if a Vector3 is passed).
 *
 * `interiorPoint` is a reference point INSIDE the band — for outlined bands
 * this is `OutlineEdge.interiorPoint`, the midpoint of the opposite end edge.
 *
 * `tab` is the tab geometry record IF the start-cap edge has a tab on it.
 * Only `tabWidth` is read — the formula `edgeMid + N * tabWidth` is exact for
 * rectangular/inset/partner tabs and lands on the apex of rounded tabs.
 * Pass `undefined` for "no tab".
 *
 * `tabWidth` is duplicated as a top-level arg because `TabGeometry` does not
 * carry `tabWidth` directly today; the caller has it from `tabConfig.tabWidth`
 * and passes both. When `tab === undefined`, `tabWidth` is ignored.
 */
export type ComputeOutlinedLabelAnchorInput = {
	edgeStart: { x: number; y: number };
	edgeEnd: { x: number; y: number };
	interiorPoint: { x: number; y: number };
	tab: { tabWidth: number } | undefined;
	tabWidth: number;
};

export type OutlinedLabelAnchor = {
	anchor: Point;
	autoAngle: number;
};

export const computeOutlinedLabelAnchor = (
	input: ComputeOutlinedLabelAnchorInput
): OutlinedLabelAnchor => {
	const { edgeStart, edgeEnd, interiorPoint, tab, tabWidth } = input;

	const edgeMid: Point = {
		x: (edgeStart.x + edgeEnd.x) / 2,
		y: (edgeStart.y + edgeEnd.y) / 2
	};

	// Outward unit normal: direction from band interior toward the edge midpoint.
	const nx = edgeMid.x - interiorPoint.x;
	const ny = edgeMid.y - interiorPoint.y;
	const nLen = Math.hypot(nx, ny) || 1;
	const N: Point = { x: nx / nLen, y: ny / nLen };

	// Anchor: edge midpoint, optionally shifted outward by tab width for tabbed bands.
	const anchor: Point = tab
		? { x: edgeMid.x + N.x * tabWidth, y: edgeMid.y + N.y * tabWidth }
		: edgeMid;

	// SVG rotate(θ) takes (0,1) → (-sin θ, cos θ). Solve for θ such that this equals N.
	const autoAngle = Math.atan2(-N.x, N.y);

	return { anchor, autoAngle };
};
