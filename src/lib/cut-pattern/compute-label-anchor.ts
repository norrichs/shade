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
 * `hasTab` is `true` if the start-cap edge has a tab attached. When true, the
 * anchor is shifted outward by `tabWidth` to land on the outer-edge midpoint of
 * the tab instead of the band edge midpoint.
 *
 * `tabWidth` is the tab width in the same coordinate units as the edge. The
 * formula `edgeMid + N * tabWidth` is exact for rectangular/inset/partner tabs
 * and lands on the apex of rounded tabs. Ignored when `hasTab` is false.
 */
export type ComputeOutlinedLabelAnchorInput = {
	edgeStart: { x: number; y: number };
	edgeEnd: { x: number; y: number };
	interiorPoint: { x: number; y: number };
	/**
	 * Whether the start-cap edge has a tab attached. When true, the anchor is
	 * shifted outward by `tabWidth` to land on the outer-edge midpoint of the tab
	 * instead of the band edge midpoint. The geometry of the tab beyond its
	 * `tabWidth` is not consulted — the formula is exact for rectangular/inset/
	 * partner tabs and lands on the apex of rounded tabs.
	 */
	hasTab: boolean;
	/**
	 * Tab width in the same coordinate units as the edge. Ignored when `hasTab`
	 * is false.
	 */
	tabWidth: number;
};

export type OutlinedLabelAnchor = {
	anchor: Point;
	autoAngle: number;
};

export const computeOutlinedLabelAnchor = (
	input: ComputeOutlinedLabelAnchorInput
): OutlinedLabelAnchor => {
	const { edgeStart, edgeEnd, interiorPoint, hasTab, tabWidth } = input;

	const edgeMid: Point = {
		x: (edgeStart.x + edgeEnd.x) / 2,
		y: (edgeStart.y + edgeEnd.y) / 2
	};

	// Outward unit normal: perpendicular to the cap edge, pointing away from
	// the band interior. MUST match the convention used by `getOutwardNormal`
	// in generate-tab-geometry.ts so that the tab's outer face and the label
	// anchor land on the same line — otherwise the label outline and the
	// band's tab outline don't meet, and paper.js's `unite` returns a compound
	// path (label not touching) for skewed/curved cap edges.
	const edgeDx = edgeEnd.x - edgeStart.x;
	const edgeDy = edgeEnd.y - edgeStart.y;
	const perpLen = Math.hypot(edgeDx, edgeDy) || 1;
	let Nx = -edgeDy / perpLen;
	let Ny = edgeDx / perpLen;
	// Flip if the perpendicular candidate points toward the interior.
	if (Nx * (interiorPoint.x - edgeStart.x) + Ny * (interiorPoint.y - edgeStart.y) > 0) {
		Nx = -Nx;
		Ny = -Ny;
	}
	const N: Point = { x: Nx, y: Ny };

	// Anchor: edge midpoint, optionally shifted outward by tab width for tabbed bands.
	const anchor: Point = hasTab
		? { x: edgeMid.x + N.x * tabWidth, y: edgeMid.y + N.y * tabWidth }
		: edgeMid;

	// SVG rotate(θ) takes (0,1) → (-sin θ, cos θ). Solve for θ such that this equals N.
	const autoAngle = Math.atan2(-N.x, N.y);

	return { anchor, autoAngle };
};
