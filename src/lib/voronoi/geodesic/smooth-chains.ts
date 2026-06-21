import { Vector3 } from 'three';

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
