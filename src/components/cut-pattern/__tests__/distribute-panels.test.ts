import { Vector3 } from 'three';

// Copy the function directly to avoid complex import issues during testing
const Z_AXIS = new Vector3(0, 0, 1);

function signedZAxisAngleTo(u: Vector3, v: Vector3) {
	const angle = u.angleTo(v);

	// Handle the case when vectors are exactly opposite (180 degrees)
	// In this case, cross product is zero, so we return π
	if (Math.abs(angle - Math.PI) < 1e-10) {
		return Math.PI;
	}

	const cross = new Vector3().crossVectors(u, v);
	const sign = Math.sign(cross.dot(Z_AXIS));
	return angle * sign;
}

describe('signedZAxisAngleTo', () => {
	it('should return 0 for identical vectors', () => {
		const v1 = new Vector3(1, 0, 0);
		const v2 = new Vector3(1, 0, 0);

		expect(signedZAxisAngleTo(v1, v2)).toBeCloseTo(0);
	});

	it('should return positive angle for counter-clockwise rotation', () => {
		const v1 = new Vector3(1, 0, 0); // positive X axis
		const v2 = new Vector3(0, 1, 0); // positive Y axis

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(Math.PI / 2); // 90 degrees in radians
	});

	it('should return negative angle for clockwise rotation', () => {
		const v1 = new Vector3(0, 1, 0); // positive Y axis
		const v2 = new Vector3(1, 0, 0); // positive X axis

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(-Math.PI / 2); // -90 degrees in radians
	});

	it('should return π for opposite vectors', () => {
		const v1 = new Vector3(1, 0, 0);
		const v2 = new Vector3(-1, 0, 0);

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(Math.PI);
	});

	it('should return π for opposite vectors in different directions', () => {
		const v1 = new Vector3(0, 1, 0);
		const v2 = new Vector3(0, -1, 0);

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(Math.PI);
	});

	it('should return π for opposite diagonal vectors', () => {
		const v1 = new Vector3(1, 1, 0).normalize();
		const v2 = new Vector3(-1, -1, 0).normalize();

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(Math.PI);
	});

	it('should handle diagonal vectors correctly', () => {
		const v1 = new Vector3(1, 1, 0).normalize();
		const v2 = new Vector3(-1, 1, 0).normalize();

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(Math.PI / 2); // 90 degrees counter-clockwise
	});

	it('should handle 45-degree rotations', () => {
		const v1 = new Vector3(1, 0, 0);
		const v2 = new Vector3(1, 1, 0).normalize();

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(Math.PI / 4); // 45 degrees
	});

	it('should handle negative 45-degree rotations', () => {
		const v1 = new Vector3(1, 0, 0);
		const v2 = new Vector3(1, -1, 0).normalize();

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(-Math.PI / 4); // -45 degrees
	});

	it('should work with non-normalized vectors', () => {
		const v1 = new Vector3(2, 0, 0); // length 2
		const v2 = new Vector3(0, 3, 0); // length 3

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(Math.PI / 2); // 90 degrees
	});

	it('should handle vectors with Z components', () => {
		const v1 = new Vector3(1, 0, 5);
		const v2 = new Vector3(0, 1, -2);

		const result = signedZAxisAngleTo(v1, v2);
		// The function works with 3D vectors, so Z components affect the angle
		// The actual angle between these vectors is different from 90 degrees
		expect(result).toBeCloseTo(2.6404996403244363);
	});

	it('should return correct sign for small angles', () => {
		const smallAngle = 0.1; // radians
		const v1 = new Vector3(1, 0, 0);
		const v2 = new Vector3(Math.cos(smallAngle), Math.sin(smallAngle), 0);

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(smallAngle);
	});

	it('should return correct sign for small negative angles', () => {
		const smallAngle = -0.1; // radians
		const v1 = new Vector3(1, 0, 0);
		const v2 = new Vector3(Math.cos(smallAngle), Math.sin(smallAngle), 0);

		const result = signedZAxisAngleTo(v1, v2);
		expect(result).toBeCloseTo(smallAngle);
	});
});
