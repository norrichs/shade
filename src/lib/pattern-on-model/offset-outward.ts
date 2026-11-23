/**
 * Push every triangle of a non-indexed position buffer `distance` along its own
 * normal, flipped to point away from `center` (the model's outside). The pattern
 * layer sits just outside the band it decorates, so the two never z-fight and
 * the pattern reads on the outer face.
 *
 * Per-face normals leave hairline steps between neighbouring triangles, far
 * below a pixel at the distances used. Mutates and returns `positions`.
 */
export const offsetOutward = (
	positions: Float32Array,
	center: { x: number; y: number; z: number },
	distance: number
): Float32Array => {
	for (let t = 0; t + 8 < positions.length; t += 9) {
		const ax = positions[t];
		const ay = positions[t + 1];
		const az = positions[t + 2];
		const ux = positions[t + 3] - ax;
		const uy = positions[t + 4] - ay;
		const uz = positions[t + 5] - az;
		const vx = positions[t + 6] - ax;
		const vy = positions[t + 7] - ay;
		const vz = positions[t + 8] - az;
		let nx = uy * vz - uz * vy;
		let ny = uz * vx - ux * vz;
		let nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz);
		if (len === 0) continue; // degenerate (pole) facet: nothing to push
		nx /= len;
		ny /= len;
		nz /= len;
		const gx = (ax + positions[t + 3] + positions[t + 6]) / 3 - center.x;
		const gy = (ay + positions[t + 4] + positions[t + 7]) / 3 - center.y;
		const gz = (az + positions[t + 5] + positions[t + 8]) / 3 - center.z;
		const sign = nx * gx + ny * gy + nz * gz < 0 ? -distance : distance;
		for (let v = 0; v < 9; v += 3) {
			positions[t + v] += nx * sign;
			positions[t + v + 1] += ny * sign;
			positions[t + v + 2] += nz * sign;
		}
	}
	return positions;
};
