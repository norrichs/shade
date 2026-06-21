import {
	Vector3,
	BufferGeometry,
	BufferAttribute,
	Mesh,
	MeshBasicMaterial,
	Raycaster,
	Triangle,
	type Intersection
} from 'three';
import type { SurfaceTriangle } from '$lib/voronoi/types';
import { weldKey, type MeshGraph } from './mesh-graph';

/**
 * Discrete cubic smoothing spline (Whittaker–Henderson) on one coordinate series.
 * Minimises  Σ wᵢ (yᵢ − zᵢ)²  +  λ Σ (z_{k−1} − 2 z_k + z_{k+1})²
 * (the second sum is the discrete curvature/second-derivative penalty).
 *
 * The normal equations (W + λ DᵀD) z = W y form a symmetric, positive-definite
 * pentadiagonal system (half-bandwidth 2), solved with a banded Cholesky.
 * Endpoints are pinned: indices 0 and n−1 get a large data weight, then the two
 * endpoint outputs are overwritten with the exact inputs so shared corners stay
 * bit-identical. λ ≤ 0 (or fewer than 4 points) returns a copy unchanged.
 */
export function smoothSeries(values: number[], lambda: number): number[] {
	const n = values.length;
	if (n < 4 || lambda <= 0) return values.slice();

	const PIN = 1e8;
	// Symmetric pentadiagonal A = W + λ DᵀD, stored as three upper diagonals.
	const d0 = new Array<number>(n).fill(0); // A[i][i]
	const d1 = new Array<number>(n).fill(0); // A[i][i+1]
	const d2 = new Array<number>(n).fill(0); // A[i][i+2]

	for (let i = 0; i < n; i++) d0[i] = i === 0 || i === n - 1 ? PIN : 1;

	// Accumulate λ·(2nd-difference)ᵀ(2nd-difference) for each interior triple.
	// Accumulate contributions from the k-th row of the 2nd-difference operator D.
	// D[k] is non-zero at cols = [k-1, k, k+1] with coefficients [1, -2, 1].
	// (DᵀD)[i][j] = sum_k D[k][i]*D[k][j].  We store only the upper triangle
	// (j >= i) so we loop b >= a (cols is monotone so cols[b] >= cols[a]).
	const coeff = [1, -2, 1];
	for (let k = 1; k <= n - 2; k++) {
		const cols = [k - 1, k, k + 1];
		for (let a = 0; a < 3; a++) {
			const ci = cols[a];
			for (let b = a; b < 3; b++) {
				const cj = cols[b];
				const val = lambda * coeff[a] * coeff[b];
				if (ci === cj) d0[ci] += val;
				else if (cj === ci + 1) d1[ci] += val;
				else if (cj === ci + 2) d2[ci] += val;
			}
		}
	}

	// RHS b = W .* y.
	const b = new Array<number>(n);
	for (let i = 0; i < n; i++) b[i] = (i === 0 || i === n - 1 ? PIN : 1) * values[i];

	// Banded Cholesky A = L Lᵀ, half-bandwidth 2.
	// l0[i]=L[i][i], l1[i]=L[i+1][i], l2[i]=L[i+2][i].
	const l0 = new Array<number>(n).fill(0);
	const l1 = new Array<number>(n).fill(0);
	const l2 = new Array<number>(n).fill(0);
	for (let i = 0; i < n; i++) {
		const a1 = i - 1 >= 0 ? l1[i - 1] : 0;
		const a2 = i - 2 >= 0 ? l2[i - 2] : 0;
		l0[i] = Math.sqrt(d0[i] - a1 * a1 - a2 * a2);
		if (i + 1 < n) {
			const cross = i - 1 >= 0 ? l2[i - 1] * l1[i - 1] : 0;
			l1[i] = (d1[i] - cross) / l0[i];
		}
		if (i + 2 < n) l2[i] = d2[i] / l0[i];
	}

	// Forward solve L w = b.
	const w = new Array<number>(n).fill(0);
	for (let i = 0; i < n; i++) {
		const s1 = i - 1 >= 0 ? l1[i - 1] * w[i - 1] : 0;
		const s2 = i - 2 >= 0 ? l2[i - 2] * w[i - 2] : 0;
		w[i] = (b[i] - s1 - s2) / l0[i];
	}
	// Back solve Lᵀ z = w.
	const z = new Array<number>(n).fill(0);
	for (let i = n - 1; i >= 0; i--) {
		const s1 = i + 1 < n ? l1[i] * z[i + 1] : 0;
		const s2 = i + 2 < n ? l2[i] * z[i + 2] : 0;
		z[i] = (w[i] - s1 - s2) / l0[i];
	}

	// Hard-pin endpoints to exact input.
	z[0] = values[0];
	z[n - 1] = values[n - 1];
	return z;
}

/**
 * Smooth a Vector3 polyline by running `smoothSeries` on each coordinate.
 * Returns a new same-length array; endpoints are unchanged. Chains with fewer
 * than 4 points (or λ ≤ 0) are returned as clones, unchanged.
 */
export function smoothChainPoints(points: Vector3[], lambda: number): Vector3[] {
	if (points.length < 4 || lambda <= 0) return points.map((p) => p.clone());
	const xs = smoothSeries(
		points.map((p) => p.x),
		lambda
	);
	const ys = smoothSeries(
		points.map((p) => p.y),
		lambda
	);
	const zs = smoothSeries(
		points.map((p) => p.z),
		lambda
	);
	return points.map((_, i) => new Vector3(xs[i], ys[i], zs[i]));
}

/** Barycentric coords of p w.r.t. triangle (a,b,c). Degenerate → [1,0,0]. */
function barycentric(p: Vector3, a: Vector3, b: Vector3, c: Vector3): [number, number, number] {
	const v0 = b.clone().sub(a);
	const v1 = c.clone().sub(a);
	const v2 = p.clone().sub(a);
	const d00 = v0.dot(v0);
	const d01 = v0.dot(v1);
	const d11 = v1.dot(v1);
	const d20 = v2.dot(v0);
	const d21 = v2.dot(v1);
	const denom = d00 * d11 - d01 * d01;
	if (Math.abs(denom) < 1e-20) return [1, 0, 0];
	const v = (d11 * d20 - d01 * d21) / denom;
	const w = (d00 * d21 - d01 * d20) / denom;
	return [1 - v - w, v, w];
}

function faceNormalOf(t: SurfaceTriangle): Vector3 {
	const n = t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0]));
	return n.lengthSq() < 1e-18 ? new Vector3(0, 0, 1) : n.normalize();
}

/**
 * Re-projects smoothed points onto the surface. Built once per generation from
 * the surface triangles and the welded mesh graph; raycasts from a point along
 * ±normal onto a Mesh of the triangles (nearest hit wins), with a
 * closest-point-on-triangle fallback. Returned normals are a barycentric blend
 * of the hit triangle's welded vertex normals. Worker-local; never serialized.
 */
export class SurfaceProjector {
	private mesh: Mesh;
	private raycaster = new Raycaster();
	private triangles: SurfaceTriangle[];
	private triNormals: [Vector3, Vector3, Vector3][];

	constructor(triangles: SurfaceTriangle[], graph: MeshGraph) {
		this.triangles = triangles;
		const idByKey = new Map<string, number>();
		graph.positions.forEach((p, i) => idByKey.set(weldKey(p), i));

		const positions = new Float32Array(triangles.length * 9);
		this.triNormals = [];
		triangles.forEach((t, ti) => {
			for (let c = 0; c < 3; c++) {
				positions[ti * 9 + c * 3 + 0] = t[c].x;
				positions[ti * 9 + c * 3 + 1] = t[c].y;
				positions[ti * 9 + c * 3 + 2] = t[c].z;
			}
			const fallback = faceNormalOf(t);
			const normalFor = (c: number): Vector3 => {
				const id = idByKey.get(weldKey(t[c]));
				return id !== undefined ? graph.normals[id] : fallback;
			};
			this.triNormals.push([normalFor(0), normalFor(1), normalFor(2)]);
		});

		const geom = new BufferGeometry();
		geom.setAttribute('position', new BufferAttribute(positions, 3));
		this.mesh = new Mesh(geom, new MeshBasicMaterial());
	}

	project(point: Vector3, normal: Vector3): { point: Vector3; normal: Vector3 } {
		const hit = this.raycastBoth(point, normal);
		if (hit && hit.faceIndex != null && hit.faceIndex < this.triangles.length) {
			return { point: hit.point.clone(), normal: this.blendNormal(hit.faceIndex, hit.point) };
		}
		return this.closestPoint(point);
	}

	/** Closest point on the surface to `point`, with a blended welded-vertex normal.
	 * Normal-free (no ray direction needed) — used by curve-shortening, which
	 * projects moved midpoints that have no reliable ray. */
	projectClosest(point: Vector3): { point: Vector3; normal: Vector3 } {
		return this.closestPoint(point);
	}

	private raycastBoth(point: Vector3, normal: Vector3): Intersection | null {
		const dir = normal.lengthSq() < 1e-18 ? new Vector3(0, 0, 1) : normal.clone().normalize();
		this.raycaster.set(point, dir);
		const fwd = this.raycaster.intersectObject(this.mesh, false);
		this.raycaster.set(point, dir.clone().negate());
		const bwd = this.raycaster.intersectObject(this.mesh, false);
		const f = fwd[0] ?? null;
		const b = bwd[0] ?? null;
		if (f && b) return f.distance <= b.distance ? f : b;
		return f ?? b;
	}

	private blendNormal(faceIndex: number, at: Vector3): Vector3 {
		const t = this.triangles[faceIndex];
		const [u, v, w] = barycentric(at, t[0], t[1], t[2]);
		const [n0, n1, n2] = this.triNormals[faceIndex];
		const n = n0.clone().multiplyScalar(u).addScaledVector(n1, v).addScaledVector(n2, w);
		return n.lengthSq() < 1e-18 ? faceNormalOf(t) : n.normalize();
	}

	private closestPoint(point: Vector3): { point: Vector3; normal: Vector3 } {
		let bestD = Infinity;
		let bestP = point.clone();
		let bestI = 0;
		const tmp = new Vector3();
		const tri = new Triangle();
		this.triangles.forEach((t, ti) => {
			tri.set(t[0], t[1], t[2]);
			tri.closestPointToPoint(point, tmp);
			const d = tmp.distanceToSquared(point);
			if (d < bestD) {
				bestD = d;
				bestP = tmp.clone();
				bestI = ti;
			}
		});
		return { point: bestP, normal: this.blendNormal(bestI, bestP) };
	}
}
