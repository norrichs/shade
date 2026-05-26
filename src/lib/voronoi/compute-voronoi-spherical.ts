import { Vector3 } from 'three';
import { geoVoronoi } from 'd3-geo-voronoi';
import type { VoronoiEdge, VoronoiResult } from './types';

const DEGREES = 180 / Math.PI;
const RADIANS = Math.PI / 180;

export function toLonLat(point: Vector3, center: Vector3): [number, number] {
	const dir = point.clone().sub(center).normalize();
	const lon = Math.atan2(dir.y, dir.x) * DEGREES;
	const lat = Math.asin(Math.max(-1, Math.min(1, dir.z))) * DEGREES;
	return [lon, lat];
}

export function fromLonLat(lon: number, lat: number): Vector3 {
	const lambda = lon * RADIANS;
	const phi = lat * RADIANS;
	const cosPhi = Math.cos(phi);
	return new Vector3(cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi));
}

export function computeVoronoiSpherical(seeds: [number, number][]): VoronoiResult {
	const voronoi = geoVoronoi(seeds);
	const polygons = voronoi.polygons();
	const edges: VoronoiEdge[] = [];
	const vertices: [number, number][] = [];

	if (!polygons || !polygons.features) return { edges, seeds, vertices };

	const cells: [number, number][][] = polygons.features.map((feature: any) => {
		if (!feature.geometry || !feature.geometry.coordinates || !feature.geometry.coordinates[0]) {
			return [];
		}
		return feature.geometry.coordinates[0] as [number, number][];
	});

	const neighborSets: number[][] = polygons.features.map(
		(feature: any) => feature.properties?.neighbours ?? []
	);

	for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
		const cell = cells[cellIdx];
		if (cell.length < 2) continue;

		for (let i = 0; i < cell.length - 1; i++) {
			const v0 = cell[i];
			const v1 = cell[i + 1];

			const neighborIdx = findNeighborSharingEdge(cells, neighborSets[cellIdx], cellIdx, v0, v1);
			if (neighborIdx === -1 || neighborIdx < cellIdx) continue;

			edges.push({
				vertices: [
					[v0[0], v0[1]],
					[v1[0], v1[1]]
				],
				cellIndices: [cellIdx, neighborIdx]
			});
		}
	}

	return { edges, seeds, vertices };
}

function findNeighborSharingEdge(
	cells: [number, number][][],
	neighbors: number[],
	cellIdx: number,
	v0: [number, number],
	v1: [number, number]
): number {
	for (const nIdx of neighbors) {
		const neighborCell = cells[nIdx];
		if (!neighborCell || neighborCell.length < 2) continue;

		for (let j = 0; j < neighborCell.length - 1; j++) {
			const nv0 = neighborCell[j];
			const nv1 = neighborCell[j + 1];

			if (
				(closePair(nv0, v1) && closePair(nv1, v0)) ||
				(closePair(nv0, v0) && closePair(nv1, v1))
			) {
				return nIdx;
			}
		}
	}
	return -1;
}

const EPSILON = 1e-6;
function closePair(a: [number, number], b: [number, number]): boolean {
	return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
}

export function lloydRelaxSpherical(
	seeds: [number, number][],
	iterations: number
): [number, number][] {
	if (iterations === 0) return seeds;

	let current = seeds.slice();

	for (let iter = 0; iter < iterations; iter++) {
		const voronoi = geoVoronoi(current);
		const polygons = voronoi.polygons();
		if (!polygons || !polygons.features) break;

		const next: [number, number][] = current.map((seed, i) => {
			const feature = polygons.features[i];
			if (!feature?.geometry?.coordinates?.[0]) return seed;

			const ring: [number, number][] = feature.geometry.coordinates[0];
			if (ring.length < 3) return seed;

			let cx = 0;
			let cy = 0;
			let cz = 0;
			for (const [lon, lat] of ring) {
				const dir = fromLonLat(lon, lat);
				cx += dir.x;
				cy += dir.y;
				cz += dir.z;
			}
			const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
			if (len < 1e-12) return seed;
			cx /= len;
			cy /= len;
			cz /= len;

			const centroidLon = Math.atan2(cy, cx) * DEGREES;
			const centroidLat = Math.asin(Math.max(-1, Math.min(1, cz))) * DEGREES;
			return [centroidLon, centroidLat];
		});

		current = next;
	}

	return current;
}
