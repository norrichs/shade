import { Quaternion, Vector3 } from 'three';
import type { Band } from '#lib/types.js';
import { fitPlane } from '#lib/voronoi/fit-plane.js';

/**
 * Progressive unfolding of one band, for the Assembler's band viewer.
 *
 * The band is treated as a chain of rigid facets hinged on their shared
 * edges. One anchor facet (the one most parallel to the band's best-fit
 * plane) never moves; every other facet hangs off its neighbour toward the
 * anchor. At flatten fraction `t` each hinge is turned by `t` of the way to
 * flat, so `t = 0` is the band exactly as generated (world coordinates) and
 * `t = 1` is the isometric flattening in the anchor's plane.
 *
 * Fold angles are SIGNED (atan2 about the hinge axis) between orientation-
 * consistent facet normals, so flat is exactly 0 and scaling toward it is
 * continuous. The unsigned `acos` dihedral (generate-panel-pattern.ts) can't
 * tell fold direction, which is what made "almost 180°" vs "0°" look like a
 * discontinuity. Normals are made consistent across each hinge from the
 * hinge's geometry, not the stored vertex order, so bands whose winding
 * alternates still unfold instead of folding over.
 *
 * Placement is a rigid transform per facet (world = Q·v + T), composed from
 * the anchor outward. Collapsed facets (globule poles) and zero-length hinges
 * get fold 0, so they never poison the chain with NaN.
 */
export type UnfoldPlan = {
	facetCount: number;
	/** Index of the stationary facet. */
	anchor: number;
	/** The anchor's front-side (winding) unit normal. */
	anchorNormal: Vector3;
	/** Centroid of the band's original vertices. */
	centroid: Vector3;
	/** Max distance from `centroid` over the t=0 and t=1 shapes (for camera framing). */
	radius: number;
	/** Original positions, 9 floats per facet (a, b, c). */
	original: Float32Array;
	/** Facets in placement order: anchor first, each after its parent. */
	order: Int32Array;
	parent: Int32Array;
	/** Per facet: hinge pivot (original coords) — a vertex shared with the parent. */
	pivot: Vector3[];
	/** Per facet: unit hinge axis in the parent's ORIGINAL frame (zero when fold is 0). */
	axis: Vector3[];
	/** Per facet: signed fold angle from flat (radians); 0 for the anchor. */
	fold: Float64Array;
	/** Scratch: per-facet rotation / translation, reused every frame. */
	q: Quaternion[];
	tr: Vector3[];
};

const VERTS = ['a', 'b', 'c'] as const;

const scratchAxis = new Vector3();
const scratchRot = new Quaternion();
const scratchV = new Vector3();
const scratchW = new Vector3();

const vertexAt = (arr: Float32Array, facet: number, k: number, target = new Vector3()) =>
	target.set(arr[facet * 9 + k * 3], arr[facet * 9 + k * 3 + 1], arr[facet * 9 + k * 3 + 2]);

export type PrepareUnfoldOptions = {
	/** Facet index to anchor on instead of the auto choice; clamped to the band. */
	anchor?: number;
};

export const prepareUnfold = (band: Band, opts: PrepareUnfoldOptions = {}): UnfoldPlan | null => {
	const n = band.facets.length;
	if (n === 0) return null;

	const original = new Float32Array(n * 9);
	const points: Vector3[] = [];
	band.facets.forEach((facet, i) =>
		VERTS.forEach((key, k) => {
			const v = facet.triangle[key];
			original.set([v.x, v.y, v.z], i * 9 + k * 3);
			points.push(new Vector3(v.x, v.y, v.z));
		})
	);
	// Work in double precision from the source triangles; `original` is only the
	// float copy the renderer starts from.
	const tri = (i: number, k: number) => points[i * 3 + k];

	const min = new Vector3(Infinity, Infinity, Infinity);
	const max = new Vector3(-Infinity, -Infinity, -Infinity);
	points.forEach((p) => {
		min.min(p);
		max.max(p);
	});
	const diag = Math.max(max.distanceTo(min), 1e-12);
	const eps = 1e-6 * diag;
	const areaEps = 1e-10 * diag * diag;

	// Winding normals; null for collapsed facets.
	const winding: (Vector3 | null)[] = band.facets.map((_, i) => {
		const cross = new Vector3()
			.subVectors(tri(i, 1), tri(i, 0))
			.cross(new Vector3().subVectors(tri(i, 2), tri(i, 0)));
		return cross.length() < areaEps ? null : cross.normalize();
	});

	const plane = fitPlane(points);

	let anchor = -1;
	let best = -1;
	winding.forEach((w, i) => {
		if (!w) return;
		const d = Math.abs(w.dot(plane.normal));
		if (d > best) {
			best = d;
			anchor = i;
		}
	});
	if (anchor < 0) anchor = 0;
	if (opts.anchor !== undefined && Number.isFinite(opts.anchor)) {
		anchor = Math.min(n - 1, Math.max(0, Math.floor(opts.anchor)));
	}
	const anchorNormal = (winding[anchor] ?? plane.normal).clone();

	const order = new Int32Array(n);
	const parent = new Int32Array(n).fill(-1);
	let o = 0;
	order[o++] = anchor;
	for (let i = anchor + 1; i < n; i++) {
		order[o++] = i;
		parent[i] = i - 1;
	}
	for (let i = anchor - 1; i >= 0; i--) {
		order[o++] = i;
		parent[i] = i + 1;
	}

	const pivot: Vector3[] = Array.from({ length: n }, () => new Vector3());
	const axis: Vector3[] = Array.from({ length: n }, () => new Vector3());
	const fold = new Float64Array(n);
	// Orientation-consistent normal per facet (original configuration).
	const consistent: Vector3[] = Array.from({ length: n }, () => new Vector3());
	consistent[anchor].copy(anchorNormal);
	pivot[anchor].copy(tri(anchor, 0));

	for (let oi = 1; oi < n; oi++) {
		const c = order[oi];
		const p = parent[c];
		const Np = consistent[p];

		// Shared vertices: child vertex j ↔ parent vertex k, distinct on both sides.
		const pairs: [number, number][] = [];
		const usedK = new Set<number>();
		for (let j = 0; j < 3 && pairs.length < 2; j++) {
			for (let k = 0; k < 3; k++) {
				if (usedK.has(k)) continue;
				if (tri(c, j).distanceTo(tri(p, k)) < eps) {
					pairs.push([j, k]);
					usedK.add(k);
					break;
				}
			}
		}

		pivot[c].copy(pairs.length ? tri(c, pairs[0][0]) : tri(c, 0));

		const wc = winding[c];
		if (!wc) {
			// Collapsed facet: rides along with its parent, flat or not.
			consistent[c].copy(Np);
			continue;
		}

		let Nc: Vector3;
		if (pairs.length === 2) {
			const [j0, k0] = pairs[0];
			const [j1, k1] = pairs[1];
			const h0 = tri(c, j0);
			const h1 = tri(c, j1);
			const fc = tri(c, 3 - j0 - j1);
			const fp = tri(p, 3 - k0 - k1);
			const hinge = new Vector3().subVectors(h1, h0);
			const nc = new Vector3().subVectors(fc, h0).cross(hinge);
			const np = hinge.clone().cross(new Vector3().subVectors(fp, h0));
			if (nc.length() < areaEps) {
				Nc = wc.clone().multiplyScalar(wc.dot(Np) < 0 ? -1 : 1);
			} else if (np.length() < areaEps || !winding[p]) {
				nc.normalize();
				Nc = nc.dot(Np) < 0 ? nc.negate() : nc;
			} else {
				nc.normalize();
				Nc = nc.multiplyScalar(np.normalize().dot(Np) < 0 ? -1 : 1);
			}
			if (hinge.length() > eps) {
				const u = hinge.normalize();
				axis[c].copy(u);
				fold[c] = Math.atan2(u.dot(new Vector3().crossVectors(Np, Nc)), Np.dot(Nc));
			} else {
				setMinimalRotation(c, Np, Nc, axis, fold);
			}
		} else {
			// Touches the parent at a point (or not at all): turn about whatever axis
			// takes its normal onto the parent's, pivoting on the shared point.
			Nc = wc.clone().multiplyScalar(wc.dot(Np) < 0 ? -1 : 1);
			if (pairs.length === 1) setMinimalRotation(c, Np, Nc, axis, fold);
		}
		consistent[c].copy(Nc);
	}

	const plan: UnfoldPlan = {
		facetCount: n,
		anchor,
		anchorNormal,
		centroid: plane.centroid.clone(),
		radius: 0,
		original,
		order,
		parent,
		pivot,
		axis,
		fold,
		q: Array.from({ length: n }, () => new Quaternion()),
		tr: Array.from({ length: n }, () => new Vector3())
	};

	const scratch = new Float32Array(n * 9);
	let radius = 0;
	for (const t of [0, 1]) {
		applyUnfold(plan, t, scratch);
		for (let i = 0; i < n * 3; i++) {
			radius = Math.max(radius, vertexAt(scratch, 0, i, scratchV).distanceTo(plan.centroid));
		}
	}
	plan.radius = radius;
	return plan;
};

const setMinimalRotation = (
	c: number,
	Np: Vector3,
	Nc: Vector3,
	axis: Vector3[],
	fold: Float64Array
) => {
	const cross = new Vector3().crossVectors(Np, Nc);
	const s = cross.length();
	if (s < 1e-12) return; // already parallel: fold 0
	axis[c].copy(cross.normalize());
	// Rotating Np by +angle about Np×Nc reaches Nc, matching the hinge convention.
	fold[c] = Math.atan2(s, Np.dot(Nc));
};

/**
 * Write every facet's vertices at flatten fraction `t` (clamped to [0, 1]) into
 * `out` (9 floats per facet, a/b/c). Allocation-free; safe to call per frame.
 */
export const applyUnfold = (plan: UnfoldPlan, t: number, out: Float32Array): void => {
	const tt = Math.min(1, Math.max(0, t));
	const { order, parent, pivot, axis, fold, q, tr, original, facetCount } = plan;

	q[order[0]].identity();
	tr[order[0]].set(0, 0, 0);

	for (let oi = 1; oi < facetCount; oi++) {
		const c = order[oi];
		const p = parent[c];
		// Hinge axis in the parent's CURRENT frame.
		scratchAxis.copy(axis[c]).applyQuaternion(q[p]);
		if (fold[c] !== 0 && scratchAxis.lengthSq() > 0) {
			scratchRot.setFromAxisAngle(scratchAxis, -tt * fold[c]);
			q[c].multiplyQuaternions(scratchRot, q[p]);
		} else {
			q[c].copy(q[p]);
		}
		// The pivot is a point of the parent, so it lands where the parent puts it.
		scratchV.copy(pivot[c]).applyQuaternion(q[p]).add(tr[p]);
		scratchW.copy(pivot[c]).applyQuaternion(q[c]);
		tr[c].subVectors(scratchV, scratchW);
	}

	for (let f = 0; f < facetCount; f++) {
		for (let k = 0; k < 3; k++) {
			const i = f * 9 + k * 3;
			scratchV
				.set(original[i], original[i + 1], original[i + 2])
				.applyQuaternion(q[f])
				.add(tr[f]);
			out[i] = scratchV.x;
			out[i + 1] = scratchV.y;
			out[i + 2] = scratchV.z;
		}
	}
};

/** Several bands unfolded together, packed into one position buffer. */
export type MultiUnfoldPlan = {
	plans: UnfoldPlan[];
	/** Float offset of each plan's first vertex in the shared buffer. */
	offsets: Int32Array;
	facetCount: number;
	/** Centre and radius bounding every band at t=0 and t=1 (camera framing). */
	centroid: Vector3;
	radius: number;
	/** Direction the camera looks back along. */
	frameNormal: Vector3;
};

/**
 * The direction to view `plans` from. One band faces its anchor's front.
 * Several are viewed along the axis their anchor normals agree on most (the
 * principal eigenvector of Σ n·nᵀ, found by power iteration), turned toward
 * the side more bands show their front to. That keeps as many bands as
 * possible face-on: looking from the origin toward their centre put bands on
 * opposite sides of a sphere edge-on.
 */
export const multiFrameNormal = (plans: UnfoldPlan[], centroid: Vector3): Vector3 => {
	if (plans.length === 1) return plans[0].anchorNormal.clone();
	const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	const sum = new Vector3();
	for (const { anchorNormal: n } of plans) {
		const a = [n.x, n.y, n.z];
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] += a[i] * a[j];
		sum.add(n);
	}
	// Start off-axis so a start vector orthogonal to the answer is unlikely.
	const d = (sum.lengthSq() > 1e-12 ? sum.clone() : new Vector3(0.3, 1, 0.2)).normalize();
	const next = new Vector3();
	for (let k = 0; k < 64; k++) {
		next.set(
			m[0] * d.x + m[1] * d.y + m[2] * d.z,
			m[3] * d.x + m[4] * d.y + m[5] * d.z,
			m[6] * d.x + m[7] * d.y + m[8] * d.z
		);
		if (next.lengthSq() < 1e-24) break;
		d.copy(next).normalize();
	}
	const side = sum.lengthSq() > 1e-12 ? sum : centroid;
	if (d.dot(side) < 0) d.negate();
	return d;
};

export const prepareMultiUnfold = (plans: UnfoldPlan[]): MultiUnfoldPlan | null => {
	if (plans.length === 0) return null;
	const offsets = new Int32Array(plans.length);
	let facetCount = 0;
	plans.forEach((p, i) => {
		offsets[i] = facetCount * 9;
		facetCount += p.facetCount;
	});
	// Bound the union of each band's (centroid, radius) sphere.
	const min = new Vector3(Infinity, Infinity, Infinity);
	const max = new Vector3(-Infinity, -Infinity, -Infinity);
	for (const p of plans) {
		min.min(scratchV.copy(p.centroid).subScalar(p.radius));
		max.max(scratchV.copy(p.centroid).addScalar(p.radius));
	}
	const centroid = new Vector3().addVectors(min, max).multiplyScalar(0.5);
	let radius = 0;
	for (const p of plans) radius = Math.max(radius, p.centroid.distanceTo(centroid) + p.radius);
	return {
		plans,
		offsets,
		facetCount,
		centroid,
		radius,
		frameNormal: multiFrameNormal(plans, centroid)
	};
};

/** `applyUnfold` for every band of `multi` into its slice of `out`. */
export const applyMultiUnfold = (multi: MultiUnfoldPlan, t: number, out: Float32Array): void => {
	multi.plans.forEach((p, i) =>
		applyUnfold(p, t, out.subarray(multi.offsets[i], multi.offsets[i] + p.facetCount * 9))
	);
};
