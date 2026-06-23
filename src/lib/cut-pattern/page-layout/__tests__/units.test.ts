import { Box3, Vector3 } from 'three';
import { mmToInch, inchToMm, derivePageDimensions } from '../units';

describe('unit helpers', () => {
	it('converts mm <-> inch', () => {
		expect(inchToMm(1)).toBeCloseTo(25.4, 6);
		expect(mmToInch(25.4)).toBeCloseTo(1, 6);
	});

	it('derives real-world model dimensions from bounds and pageScale', () => {
		const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(10, 20, 30));
		const d = derivePageDimensions(bounds, 2); // pattern-units per mm
		expect(d.mm).toEqual({ x: 5, y: 10, z: 15 });
		expect(d.inch.x).toBeCloseTo(5 / 25.4, 6);
		expect(d.inch.z).toBeCloseTo(15 / 25.4, 6);
	});
});
