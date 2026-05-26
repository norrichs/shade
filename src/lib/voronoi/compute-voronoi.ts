import { Delaunay } from 'd3-delaunay';
import type { VoronoiEdge, VoronoiResult } from './types';

const UV_BOUNDS: [number, number, number, number] = [0, 0, 1, 1];

export function computeVoronoi(seeds: [number, number][]): VoronoiResult {
	const flat = seeds.flat();
	const delaunay = new Delaunay(flat);
	const voronoi = delaunay.voronoi(UV_BOUNDS);

	const vertices: [number, number][] = [];
	const edges: VoronoiEdge[] = [];

	for (let cellIdx = 0; cellIdx < seeds.length; cellIdx++) {
		const cell = voronoi.cellPolygon(cellIdx);
		if (!cell) continue;

		for (let i = 0; i < cell.length - 1; i++) {
			const [x0, y0] = cell[i];
			const [x1, y1] = cell[i + 1];

			const neighborIdx = findNeighborSharingEdge(voronoi, cellIdx, [x0, y0], [x1, y1]);
			if (neighborIdx === -1 || neighborIdx < cellIdx) continue;

			edges.push({
				vertices: [
					[x0, y0],
					[x1, y1]
				],
				cellIndices: [cellIdx, neighborIdx]
			});
		}
	}

	return { edges, seeds, vertices };
}

function findNeighborSharingEdge(
	voronoi: ReturnType<Delaunay['voronoi']>,
	cellIdx: number,
	v0: [number, number],
	v1: [number, number]
): number {
	const neighbors = voronoi.delaunay.neighbors(cellIdx);
	for (const nIdx of neighbors) {
		const neighborCell = voronoi.cellPolygon(nIdx);
		if (!neighborCell) continue;

		for (let j = 0; j < neighborCell.length - 1; j++) {
			const [nx0, ny0] = neighborCell[j];
			const [nx1, ny1] = neighborCell[j + 1];

			const edgeMatch =
				(close(nx0, v1[0]) && close(ny0, v1[1]) && close(nx1, v0[0]) && close(ny1, v0[1])) ||
				(close(nx0, v0[0]) && close(ny0, v0[1]) && close(nx1, v1[0]) && close(ny1, v1[1]));

			if (edgeMatch) return nIdx;
		}
	}
	return -1;
}

const EPSILON = 1e-8;
function close(a: number, b: number): boolean {
	return Math.abs(a - b) < EPSILON;
}

export function lloydRelax(seeds: [number, number][], iterations: number): [number, number][] {
	if (iterations === 0) return seeds;

	let current = seeds.slice();

	for (let iter = 0; iter < iterations; iter++) {
		const flat = current.flat();
		const delaunay = new Delaunay(flat);
		const voronoi = delaunay.voronoi(UV_BOUNDS);

		const next: [number, number][] = current.map((seed, i) => {
			const cell = voronoi.cellPolygon(i);
			if (!cell || cell.length < 3) return seed;

			let cx = 0;
			let cy = 0;
			let area = 0;

			for (let j = 0; j < cell.length - 1; j++) {
				const [x0, y0] = cell[j];
				const [x1, y1] = cell[j + 1];
				const cross = x0 * y1 - x1 * y0;
				cx += (x0 + x1) * cross;
				cy += (y0 + y1) * cross;
				area += cross;
			}

			area /= 2;
			if (Math.abs(area) < 1e-12) return seed;

			cx /= 6 * area;
			cy /= 6 * area;

			cx = Math.max(0.001, Math.min(0.999, cx));
			cy = Math.max(0.001, Math.min(0.999, cy));

			return [cx, cy];
		});

		current = next;
	}

	return current;
}
