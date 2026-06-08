import { Vector3 } from 'three';

export type FitPlaneOptions = {
	/** Used when there are <3 points or the fit is degenerate (near-collinear). */
	fallbackNormal?: Vector3;
	/** If given, flip the normal so it points away from this point (dot with centroid-from > 0). */
	orientAwayFrom?: Vector3;
};

export type FittedPlane = { normal: Vector3; centroid: Vector3 };

/** Eigen-decomposition of a symmetric 3x3 matrix via cyclic Jacobi rotations. */
function jacobiEigenSymmetric3(m: number[][]): { values: number[]; vectors: number[][] } {
	const a = m.map((row) => row.slice());
	const v = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1]
	];
	for (let sweep = 0; sweep < 50; sweep++) {
		const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
		if (off < 1e-14) break;
		for (const [p, q] of [
			[0, 1],
			[0, 2],
			[1, 2]
		] as const) {
			if (Math.abs(a[p][q]) < 1e-300) continue;
			const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
			const sign = theta >= 0 ? 1 : -1;
			const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
			const c = 1 / Math.sqrt(t * t + 1);
			const s = t * c;
			const app = a[p][p];
			const aqq = a[q][q];
			const apq = a[p][q];
			a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
			a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
			a[p][q] = 0;
			a[q][p] = 0;
			const r = 3 - p - q;
			const arp = a[r][p];
			const arq = a[r][q];
			a[r][p] = c * arp - s * arq;
			a[p][r] = a[r][p];
			a[r][q] = s * arp + c * arq;
			a[q][r] = a[r][q];
			for (let i = 0; i < 3; i++) {
				const vip = v[i][p];
				const viq = v[i][q];
				v[i][p] = c * vip - s * viq;
				v[i][q] = s * vip + c * viq;
			}
		}
	}
	return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

function orient(normal: Vector3, centroid: Vector3, opts?: FitPlaneOptions): Vector3 {
	if (opts?.orientAwayFrom) {
		const away = centroid.clone().sub(opts.orientAwayFrom);
		if (normal.dot(away) < 0) normal.multiplyScalar(-1);
	}
	return normal;
}

/**
 * Best-fit plane through a point cloud via PCA: the normal is the eigenvector of the
 * smallest eigenvalue of the centered covariance matrix. Falls back to
 * opts.fallbackNormal when there are <3 points or the fit is degenerate
 * (smallest two eigenvalues both ~0, i.e. collinear).
 */
export function fitPlane(points: Vector3[], opts?: FitPlaneOptions): FittedPlane {
	const centroid = new Vector3();
	for (const p of points) centroid.add(p);
	if (points.length > 0) centroid.divideScalar(points.length);

	const fallback = (opts?.fallbackNormal ?? new Vector3(0, 0, 1)).clone().normalize();

	if (points.length < 3) {
		return { normal: orient(fallback, centroid, opts), centroid };
	}

	let xx = 0;
	let xy = 0;
	let xz = 0;
	let yy = 0;
	let yz = 0;
	let zz = 0;
	for (const p of points) {
		const dx = p.x - centroid.x;
		const dy = p.y - centroid.y;
		const dz = p.z - centroid.z;
		xx += dx * dx;
		xy += dx * dy;
		xz += dx * dz;
		yy += dy * dy;
		yz += dy * dz;
		zz += dz * dz;
	}
	const cov = [
		[xx, xy, xz],
		[xy, yy, yz],
		[xz, yz, zz]
	];
	const { values, vectors } = jacobiEigenSymmetric3(cov);

	const idx = [0, 1, 2].sort((a, b) => values[a] - values[b]);
	const largest = Math.max(values[0], values[1], values[2], 1e-30);
	if (values[idx[1]] / largest < 1e-9) {
		return { normal: orient(fallback, centroid, opts), centroid };
	}

	const min = idx[0];
	const normal = new Vector3(vectors[0][min], vectors[1][min], vectors[2][min]).normalize();
	return { normal: orient(normal, centroid, opts), centroid };
}
