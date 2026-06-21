import { Vector3 } from 'three';
import type { SurfaceTriangle, VoronoiConfig, VoronoiEdge, GeodesicEdgeStyle } from '$lib/voronoi/types';
import { generateAreaWeightedSeeds } from '$lib/voronoi/generate-seeds';
import type { EdgeProjection } from '$lib/voronoi/project-edges-onto-surface';
import { computeAdaptiveEdgeDivisions } from '$lib/voronoi/edge-divisions';
import { buildMeshGraph, traceBoundaryLoops, type MeshGraph } from './mesh-graph';
import { DijkstraGeodesicSolver, type GeodesicField } from './geodesic-solver';
import { extractBoundaries, type BoundaryChain } from './extract-boundaries';
import { buildRimChains } from './rim-edges';
import { smoothChainPoints, SurfaceProjector } from './smooth-chains';
import { straightenToGeodesic } from './geodesic-straighten';
import { OPENING } from '$lib/types';

export type GeodesicVoronoiResult = {
	edges: VoronoiEdge[];
	edgeProjections: EdgeProjection[];
	seedPoints3d: (Vector3 | null)[];
};

function nearestVertex(graph: MeshGraph, p: Vector3): number {
	let best = -1;
	let bestD = Infinity;
	for (let i = 0; i < graph.positions.length; i++) {
		const d = graph.positions[i].distanceToSquared(p);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}

function polylineLength(points: Vector3[]): number {
	let len = 0;
	for (let i = 1; i < points.length; i++) len += points[i].distanceTo(points[i - 1]);
	return len;
}

/** Resample a polyline (+parallel normals) to `count` points by arc length. */
function resample(
	points: Vector3[],
	normals: Vector3[],
	count: number
): { points: Vector3[]; normals: Vector3[] } {
	// count >= 2 falls through to the normal path, which emits exactly `count` points
	// (endpoints preserved). Only truly degenerate inputs short-circuit.
	if (points.length < 2 || count <= 1) {
		return { points: points.map((p) => p.clone()), normals: normals.map((n) => n.clone()) };
	}
	const cum: number[] = [0];
	for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
	const total = cum[cum.length - 1];
	if (total < 1e-12) {
		return { points: points.map((p) => p.clone()), normals: normals.map((n) => n.clone()) };
	}
	const outP: Vector3[] = [];
	const outN: Vector3[] = [];
	for (let k = 0; k < count; k++) {
		const target = (k / (count - 1)) * total;
		let seg = 1;
		while (seg < cum.length - 1 && cum[seg] < target) seg++;
		const segLen = cum[seg] - cum[seg - 1];
		const t = segLen < 1e-12 ? 0 : (target - cum[seg - 1]) / segLen;
		outP.push(points[seg - 1].clone().lerp(points[seg], t));
		outN.push(normals[seg - 1].clone().lerp(normals[seg], t).normalize());
	}
	return { points: outP, normals: outN };
}

/** Geodesic centroid (approx): mean of vertices labeled to each cell, re-snapped. */
function relaxSeeds(graph: MeshGraph, field: GeodesicField, cellCount: number): number[] {
	const acc = Array.from({ length: cellCount }, () => new Vector3());
	const counts = new Array(cellCount).fill(0);
	for (let v = 0; v < graph.positions.length; v++) {
		const s = field[v].nearestSeed;
		if (s < 0) continue;
		acc[s].add(graph.positions[v]);
		counts[s]++;
	}
	const next: number[] = [];
	for (let s = 0; s < cellCount; s++) {
		if (counts[s] === 0) {
			next.push(-1);
			continue;
		}
		next.push(nearestVertex(graph, acc[s].divideScalar(counts[s])));
	}
	return next;
}

export function generateGeodesicVoronoi(
	config: VoronoiConfig,
	surfaceTriangles: SurfaceTriangle[]
): GeodesicVoronoiResult {
	const graph = buildMeshGraph(surfaceTriangles);
	const solver = new DijkstraGeodesicSolver(graph);

	// Seeds: area-weighted (center-free), snapped to graph vertices.
	const sm = config.seedConfig.seedMethod;
	const seedMethod =
		sm.type === 'areaWeighted'
			? sm
			: { type: 'areaWeighted' as const, pointCount: sm.pointCount, seed: sm.seed };
	const seeds3d = generateAreaWeightedSeeds(seedMethod, surfaceTriangles);
	let seedVerts = seeds3d.map((p) => nearestVertex(graph, p));
	const cellCount = seedVerts.length;

	// Lloyd relaxation (reuse the existing relaxationIterations setting).
	let field = solver.solveMultiSource(seedVerts);
	const iters = Math.max(0, Math.floor(config.seedConfig.relaxationIterations ?? 0));
	for (let it = 0; it < iters; it++) {
		const relaxed = relaxSeeds(graph, field, cellCount);
		seedVerts = relaxed.map((v, i) => (v >= 0 ? v : seedVerts[i]));
		field = solver.solveMultiSource(seedVerts);
	}

	const seedPoints3d: (Vector3 | null)[] = seedVerts.map((v) =>
		v >= 0 ? graph.positions[v].clone() : null
	);

	// Boundaries -> resample to adaptive divisions.
	// Cell-cell boundaries plus, for open surfaces, per-cell rim chains tracing the openings.
	const cellChains = extractBoundaries(graph, field);
	const rimChains = buildRimChains(graph, field, traceBoundaryLoops(graph));
	const chains: BoundaryChain[] = [...cellChains, ...rimChains];
	const lengths = chains.map((c) => polylineLength(c.points));
	const divisionCounts = computeAdaptiveEdgeDivisions(lengths, config.edgeDivisions);

	const edgeStyle: GeodesicEdgeStyle = config.geodesicEdgeStyle ?? 'bisector';
	const lambda = Math.max(0, config.geodesicSmoothing ?? 0);
	const straightenCap = Math.max(0, Math.floor(config.geodesicStraightenCap ?? 60));
	// A projector is needed whenever points get re-projected (smoothed or geodesic).
	const projector = edgeStyle !== 'bisector' ? new SurfaceProjector(surfaceTriangles, graph) : null;

	const edges: VoronoiEdge[] = [];
	const edgeProjections: EdgeProjection[] = [];
	chains.forEach((chain, i) => {
		const isRim = chain.cellIndices.includes(OPENING);
		// Geodesic straightening applies to cell-cell edges only; rim edges trace
		// an opening and must stay on the rim, so they keep the smoothed treatment.
		const straighten = edgeStyle === 'geodesic' && !isRim && chain.points.length >= 4;
		const smoothing =
			(edgeStyle === 'smoothed' || (edgeStyle === 'geodesic' && isRim)) &&
			lambda > 0 &&
			chain.points.length >= 4;

		const srcPoints = smoothing ? smoothChainPoints(chain.points, lambda) : chain.points;
		const { points, normals } = resample(srcPoints, chain.normals, divisionCounts[i]);
		if (points.length < 2) return;

		// Interior points get re-projected; endpoints are left exactly as resampled
		// so shared corners stay bit-identical across chains.
		if (straighten && projector) {
			const tolerance = 1e-4 * polylineLength(points);
			const straightened = straightenToGeodesic(points, projector, {
				stepFactor: 0.5,
				tolerance,
				cap: straightenCap
			});
			for (let k = 1; k < points.length - 1; k++) {
				points[k] = straightened[k];
				normals[k] = projector.projectClosest(straightened[k]).normal;
			}
		} else if (smoothing && projector) {
			for (let k = 1; k < points.length - 1; k++) {
				const pr = projector.project(points[k], normals[k]);
				points[k] = pr.point;
				normals[k] = pr.normal;
			}
		}

		edges.push({
			vertices: [
				[chain.vertices[0], 0],
				[chain.vertices[1], 0]
			],
			cellIndices: chain.cellIndices
		});
		edgeProjections.push({ edgePoints3d: points, normals });
	});

	return { edges, edgeProjections, seedPoints3d };
}
