import {
	isSuperGlobuleProjectionCutPattern,
	type SuperGlobuleProjectionPattern
} from '$lib/stores';
import type {
	BandCutPattern,
	CutPattern,
	PathSegment,
	ProjectionCutPattern,
	SuperGlobuleConfig
} from '$lib/types';
import {
	isArcPathSegment,
	isCubicBezierPathSegment,
	isLinePathSegment,
	isMovePathSegment,
	isQuadraticBezierPathSegment,
	isReturnPathSegment
} from '$lib/types';
import { Bezier } from 'bezier-js';

export const getMetaInfo = (projectionPattern: SuperGlobuleProjectionPattern | undefined) => {
	if (!projectionPattern) return undefined;
	const metaInfo: any = {};
	if (isSuperGlobuleProjectionCutPattern(projectionPattern)) {
		metaInfo.projectionCutPattern = getProjectionCutPatternMeta(
			projectionPattern.projectionCutPattern
		);
	}
	console.debug('META INFO', metaInfo);
	const perTube = metaInfo.projectionCutPattern?.tubes.map((tube) =>
		tube.bands.reduce((acc, band) => acc + band.segmentLength, 0)
	);
	console.debug('PER TUBE', perTube);
	return metaInfo;
};

const getProjectionCutPatternMeta = (
	projectionCutPattern: ProjectionCutPattern,
	config: SuperGlobuleConfig
) => {
	return {
		tubes: projectionCutPattern.tubes.map((tube) => {
			return {
				bands: tube.bands.map((band: BandCutPattern) => {
					return {
						segmentLength: band.facets.reduce(
							(acc, facet) => acc + getFacetSegmentLength(facet.path),
							0
						)
					};
				})
			};
		})
	};
};

const getFacetSegmentLength = (path: PathSegment[]): number => {
	let totalLength = 0;
	let currentPos = { x: 0, y: 0 };
	let startPos = { x: 0, y: 0 }; // Track the start position for 'Z' segments

	for (const segment of path) {
		if (isMovePathSegment(segment)) {
			// Move command - update position but no length
			currentPos = { x: segment[1], y: segment[2] };
			startPos = { x: segment[1], y: segment[2] };
		} else if (isLinePathSegment(segment)) {
			// Line segment - calculate Euclidean distance
			const endPos = { x: segment[1], y: segment[2] };
			const dx = endPos.x - currentPos.x;
			const dy = endPos.y - currentPos.y;
			totalLength += Math.sqrt(dx * dx + dy * dy);
			currentPos = endPos;
		} else if (isArcPathSegment(segment)) {
			// Arc segment ['A', rx, ry, rotation, largeArcFlag, sweepFlag, x, y]
			const rx = segment[1];
			const ry = segment[2];
			const rotation = segment[3];
			const largeArcFlag = segment[4];
			const sweepFlag = segment[5];
			const endPos = { x: segment[6], y: segment[7] };

			// Calculate arc length using numerical approximation
			totalLength += calculateArcLength(
				currentPos,
				endPos,
				rx,
				ry,
				rotation,
				largeArcFlag,
				sweepFlag
			);
			currentPos = endPos;
		} else if (isCubicBezierPathSegment(segment)) {
			// Cubic Bezier ['C', cp1x, cp1y, cp2x, cp2y, x, y]
			const bezier = new Bezier(
				currentPos,
				{ x: segment[1], y: segment[2] },
				{ x: segment[3], y: segment[4] },
				{ x: segment[5], y: segment[6] }
			);
			totalLength += bezier.length();
			currentPos = { x: segment[5], y: segment[6] };
		} else if (isQuadraticBezierPathSegment(segment)) {
			// Quadratic Bezier ['Q', cpx, cpy, x, y]
			const bezier = new Bezier(
				currentPos,
				{ x: segment[1], y: segment[2] },
				{ x: segment[3], y: segment[4] }
			);
			totalLength += bezier.length();
			currentPos = { x: segment[3], y: segment[4] };
		} else if (isReturnPathSegment(segment)) {
			// Return to start - calculate distance back to startPos
			const dx = startPos.x - currentPos.x;
			const dy = startPos.y - currentPos.y;
			totalLength += Math.sqrt(dx * dx + dy * dy);
			currentPos = startPos;
		}
	}

	return totalLength;
};

// Helper function to calculate arc length
// Based on SVG arc parameterization
const calculateArcLength = (
	start: { x: number; y: number },
	end: { x: number; y: number },
	rx: number,
	ry: number,
	rotation: number,
	largeArcFlag: number,
	sweepFlag: number
): number => {
	// Handle degenerate case where start and end are the same
	if (start.x === end.x && start.y === end.y) {
		return 0;
	}

	// Convert rotation to radians
	const phi = (rotation * Math.PI) / 180;
	const cosPhi = Math.cos(phi);
	const sinPhi = Math.sin(phi);

	// Step 1: Compute center point
	const dx = (start.x - end.x) / 2;
	const dy = (start.y - end.y) / 2;
	const x1Prime = cosPhi * dx + sinPhi * dy;
	const y1Prime = -sinPhi * dx + cosPhi * dy;

	// Correct radii if needed
	const lambda = (x1Prime * x1Prime) / (rx * rx) + (y1Prime * y1Prime) / (ry * ry);
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}

	// Step 2: Compute center
	const sign = largeArcFlag === sweepFlag ? -1 : 1;
	const sq = Math.max(
		0,
		(rx * rx * ry * ry - rx * rx * y1Prime * y1Prime - ry * ry * x1Prime * x1Prime) /
			(rx * rx * y1Prime * y1Prime + ry * ry * x1Prime * x1Prime)
	);
	const coef = sign * Math.sqrt(sq);
	const cxPrime = coef * ((rx * y1Prime) / ry);
	const cyPrime = coef * (-(ry * x1Prime) / rx);

	// Step 3: Compute angle span
	const ux = (x1Prime - cxPrime) / rx;
	const uy = (y1Prime - cyPrime) / ry;
	const vx = (-x1Prime - cxPrime) / rx;
	const vy = (-y1Prime - cyPrime) / ry;

	const n = Math.sqrt(ux * ux + uy * uy);
	const p = ux; // 1 * ux + 0 * uy
	let angleStart = Math.acos(p / n);
	if (uy < 0) angleStart = -angleStart;

	const m = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
	let angleExtent = Math.acos((ux * vx + uy * vy) / m);
	if (ux * vy - uy * vx < 0) angleExtent = -angleExtent;

	if (sweepFlag === 0 && angleExtent > 0) {
		angleExtent -= 2 * Math.PI;
	} else if (sweepFlag === 1 && angleExtent < 0) {
		angleExtent += 2 * Math.PI;
	}

	// Approximate arc length using Ramanujan's approximation for ellipse
	const a = Math.max(rx, ry);
	const b = Math.min(rx, ry);
	const h = Math.pow((a - b) / (a + b), 2);
	const circumference = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));

	// Arc length is proportional to the angle
	return Math.abs(angleExtent / (2 * Math.PI)) * circumference;
};
