import { Vector2 } from 'three';

export type SliceResult = { loops: Vector2[][]; openChains: number };

type Node = { point: Vector2; neighbors: string[] };

const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/** Vertices this close to the plane, relative to the mesh's height, lie on it. */
const ON_PLANE_TOLERANCE = 1e-9;

/**
 * Cuts a welded, indexed triangle mesh with the plane z = `z`. Each crossing
 * point is keyed by the mesh edge it lies on, so neighbouring triangles share it
 * exactly. A vertex on the plane (within tolerance) counts as above it and is
 * keyed by the vertex itself, which keeps every straddling triangle to exactly
 * two crossings. Loops are closed (first point not repeated) and unoriented;
 * chains that can't close are counted, not returned.
 */
export function sliceMeshAtZ(positions: Float32Array, index: Uint32Array, z: number): SliceResult {
	let zMin = Infinity;
	let zMax = -Infinity;
	for (let i = 2; i < positions.length; i += 3) {
		zMin = Math.min(zMin, positions[i]);
		zMax = Math.max(zMax, positions[i]);
	}
	const tolerance = ON_PLANE_TOLERANCE * Math.max(zMax - zMin, 1);
	const isOnPlane = (v: number) => Math.abs(positions[v * 3 + 2] - z) <= tolerance;

	const nodes = new Map<string, Node>();
	const crossing = (a: number, b: number): string => {
		const onPlane = [a, b].find(isOnPlane);
		const key = onPlane === undefined ? edgeKey(a, b) : `v${onPlane}`;
		if (!nodes.has(key)) {
			let point: Vector2;
			if (onPlane !== undefined) {
				point = new Vector2(positions[onPlane * 3], positions[onPlane * 3 + 1]);
			} else {
				const za = positions[a * 3 + 2];
				const zb = positions[b * 3 + 2];
				const u = (z - za) / (zb - za);
				const lerp = (k: number) =>
					positions[a * 3 + k] + (positions[b * 3 + k] - positions[a * 3 + k]) * u;
				point = new Vector2(lerp(0), lerp(1));
			}
			nodes.set(key, { point, neighbors: [] });
		}
		return key;
	};

	for (let f = 0; f < index.length; f += 3) {
		const tri = [index[f], index[f + 1], index[f + 2]];
		const above = tri.map((v) => isOnPlane(v) || positions[v * 3 + 2] > z);
		const keys: string[] = [];
		for (let e = 0; e < 3; e++) {
			const a = tri[e];
			const b = tri[(e + 1) % 3];
			if (above[e] !== above[(e + 1) % 3]) keys.push(crossing(a, b));
		}
		// Both crossings on one on-plane vertex: the triangle only touches the plane.
		if (keys.length !== 2 || keys[0] === keys[1]) continue;
		nodes.get(keys[0])!.neighbors.push(keys[1]);
		nodes.get(keys[1])!.neighbors.push(keys[0]);
	}

	const visited = new Set<string>();
	const walk = (start: string): { points: Vector2[]; closed: boolean } => {
		const points: Vector2[] = [];
		let previous: string | undefined;
		let current: string | undefined = start;
		while (current !== undefined && !visited.has(current)) {
			visited.add(current);
			points.push(nodes.get(current)!.point);
			const next: string | undefined = nodes.get(current)!.neighbors.find((n) => n !== previous);
			previous = current;
			current = next;
		}
		return { points, closed: current === start && points.length > 2 };
	};

	const loops: Vector2[][] = [];
	let openChains = 0;
	// Chain ends first, so an open chain is walked from one end to the other.
	for (const [key, node] of nodes) {
		if (node.neighbors.length === 1 && !visited.has(key)) {
			walk(key);
			openChains++;
		}
	}
	for (const key of nodes.keys()) {
		if (visited.has(key)) continue;
		const { points, closed } = walk(key);
		if (closed) loops.push(points);
		else openChains++;
	}
	return { loops, openChains };
}
