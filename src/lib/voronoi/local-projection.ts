import { Object3D, Vector2, Vector3 } from 'three';
import type { VoronoiEdge } from './types';
import type { EdgeProjection } from './project-edges-onto-surface';
import type { EdgeInsets } from './inset-types';
import { fitPlane } from './fit-plane';
import { buildPlaneBasis, projectToPlane2D, plane2DToPoint3D } from './source-projection';
import { insetPoint2D, insetIntermediates2D, segmentIntermediates2D } from './inset-2d';
import { buildCellCurvedInsets2d, vertexKey, type CurvedCellEdge } from './curved-inset-2d';
import { selectSurfaceHit } from './select-surface-hit';

const DEFAULT_SOURCE_DISTANCE_FACTOR = 10;

function maxPairwiseDistance(points: Vector3[]): number {
	let max = 0;
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			const d = points[i].distanceTo(points[j]);
			if (d > max) max = d;
		}
	}
	return max;
}

function averageNormal(edgeIdxs: number[], edgeProjections: EdgeProjection[]): Vector3 {
	const acc = new Vector3();
	let n = 0;
	for (const ei of edgeIdxs) {
		for (const nrm of edgeProjections[ei].normals) {
			acc.add(nrm);
			n++;
		}
	}
	if (n === 0) return new Vector3(0, 0, 1);
	return acc.divideScalar(n).normalize();
}

/**
 * Per-cell "local projection" inset: fit an average plane to each cell's on-surface points,
 * place a far source on its normal, flatten the cell to 2D, inset toward the seed by
 * homothety, and back-project onto the surface choosing the hit nearest the known edge point.
 */
export function computeEdgeInsetsLocalProjection(params: {
	edges: VoronoiEdge[];
	edgeProjections: EdgeProjection[];
	seedPoints3d: (Vector3 | null)[];
	surface: Object3D;
	surfaceCenter: Vector3;
	curveOffsetFactor: number;
	surfaceProjectionDivisions: number;
	sourceDistanceFactor?: number;
	curvedInset?: boolean;
}): EdgeInsets[] {
	const {
		edges,
		edgeProjections,
		seedPoints3d,
		surface,
		surfaceCenter,
		curveOffsetFactor,
		surfaceProjectionDivisions
	} = params;
	const distanceFactor = params.sourceDistanceFactor ?? DEFAULT_SOURCE_DISTANCE_FACTOR;
	const curvedInset = params.curvedInset ?? false;

	// Initialize output; default every side to the edge points so any edge a cell pass misses
	// still yields a valid (degenerate) inset rather than undefined.
	const result: EdgeInsets[] = edges.map((_, i) => {
		const pts = edgeProjections[i].edgePoints3d;
		return {
			curvePointsA: pts.map((p) => p.clone()),
			curvePointsB: pts.map((p) => p.clone()),
			divsA: pts.map(() => []),
			divsB: pts.map(() => [])
		};
	});

	// cell -> list of its edge indices
	const cellEdges = new Map<number, number[]>();
	edges.forEach((edge, edgeIndex) => {
		for (const cell of edge.cellIndices) {
			const list = cellEdges.get(cell);
			if (list) list.push(edgeIndex);
			else cellEdges.set(cell, [edgeIndex]);
		}
	});

	for (const [cell, edgeIdxs] of cellEdges) {
		// Sample set: all on-surface edge points of this cell + the cell seed.
		const samples: Vector3[] = [];
		for (const ei of edgeIdxs) samples.push(...edgeProjections[ei].edgePoints3d);
		const seed3d = seedPoints3d[cell] ?? null;
		if (samples.length === 0) continue;
		if (seed3d) samples.push(seed3d);

		const fallbackNormal = averageNormal(edgeIdxs, edgeProjections);
		const { normal, centroid } = fitPlane(samples, {
			fallbackNormal,
			orientAwayFrom: surfaceCenter
		});
		const size = maxPairwiseDistance(samples);
		if (size < 1e-9) continue;
		const sourceDistance = distanceFactor * size;
		const source = centroid.clone().addScaledVector(normal, sourceDistance);
		const planePoint = centroid.clone().addScaledVector(normal, sourceDistance / 2);
		const basis = buildPlaneBasis(normal);

		// 2D seed (homothety target). Fall back to the plane origin if projection fails.
		const seed2d =
			(seed3d && projectToPlane2D(seed3d, source, planePoint, normal, basis)) || new Vector2(0, 0);

		// When curvedInset is on, precompute this cell's curved inner curves (plane-2D).
		// Map edgeId -> samples | null; null edges fall back to the straight inset below.
		let curvedByEdge: Map<number, Vector2[] | null> | null = null;
		if (curvedInset) {
			const vertexPos2d = new Map<string, Vector2>();
			const cellEdgeInputs: CurvedCellEdge[] = [];
			for (const ei of edgeIdxs) {
				const pts3d = edgeProjections[ei].edgePoints3d;
				if (pts3d.length < 2) continue;
				const vS = vertexKey(edges[ei].vertices[0]);
				const vE = vertexKey(edges[ei].vertices[1]);
				if (!vertexPos2d.has(vS)) {
					const p = projectToPlane2D(pts3d[0], source, planePoint, normal, basis);
					if (p) vertexPos2d.set(vS, p);
				}
				if (!vertexPos2d.has(vE)) {
					const p = projectToPlane2D(pts3d[pts3d.length - 1], source, planePoint, normal, basis);
					if (p) vertexPos2d.set(vE, p);
				}
				cellEdgeInputs.push({ edgeId: ei, vKeyStart: vS, vKeyEnd: vE, sampleCount: pts3d.length });
			}
			curvedByEdge = buildCellCurvedInsets2d({
				edges: cellEdgeInputs,
				vertexPos2d,
				seed2d,
				curveOffsetFactor
			});
		}

		for (const ei of edgeIdxs) {
			const pts = edgeProjections[ei].edgePoints3d;
			const isSideA = edges[ei].cellIndices[0] === cell;
			const curve: Vector3[] = [];
			const divs: Vector3[][] = [];

			// Curved samples for this edge. A non-null curve has length == sampleCount ==
			// pts.length by construction; the length check is defensive (and also coerces a
			// null fallback entry to null). null edges fall through to the straight path.
			const curvedRaw = curvedByEdge?.get(ei) ?? null;
			const inner2dArr = curvedRaw && curvedRaw.length === pts.length ? curvedRaw : null;

			for (let i = 0; i < pts.length; i++) {
				const anchor = pts[i];
				const e2d = projectToPlane2D(anchor, source, planePoint, normal, basis);
				if (!e2d) {
					curve.push(anchor.clone());
					divs.push([]);
					continue;
				}

				// inset2d: the inner point (curved or straight). interSource2d: rung
				// intermediates ordered inset -> edge in 2D.
				let inset2d: Vector2;
				let interSource2d: Vector2[];
				if (inner2dArr) {
					inset2d = inner2dArr[i];
					interSource2d = segmentIntermediates2D(inset2d, e2d, surfaceProjectionDivisions);
				} else {
					inset2d = insetPoint2D(e2d, seed2d, curveOffsetFactor);
					interSource2d = insetIntermediates2D(
						e2d,
						seed2d,
						curveOffsetFactor,
						surfaceProjectionDivisions
					);
				}

				const insetThrough = plane2DToPoint3D(inset2d, planePoint, basis);
				const insetPt =
					selectSurfaceHit({
						surface,
						source,
						through: insetThrough,
						anchor,
						cellNormal: normal
					}) ?? anchor.clone();
				curve.push(insetPt);

				const interPts = interSource2d.map((p2) => {
					const through = plane2DToPoint3D(p2, planePoint, basis);
					return (
						selectSurfaceHit({ surface, source, through, anchor, cellNormal: normal }) ??
						anchor.clone()
					);
				});
				divs.push(interPts);
			}

			if (isSideA) {
				result[ei].curvePointsA = curve;
				result[ei].divsA = divs; // already cA -> edge
			} else {
				result[ei].curvePointsB = curve;
				// EdgeInsets.divsB is ordered edge -> cB; our intermediates are cB -> edge, so reverse.
				result[ei].divsB = divs.map((d) => d.slice().reverse());
			}
		}
	}

	return result;
}
