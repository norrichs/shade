import { mulberry32 } from '../rng';

describe('mulberry32', () => {
	it('yields numbers in [0, 1)', () => {
		const rand = mulberry32(42);
		for (let i = 0; i < 100; i++) {
			const v = rand();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it('is deterministic for a given seed', () => {
		const a = mulberry32(7);
		const b = mulberry32(7);
		const seqA = Array.from({ length: 20 }, () => a());
		const seqB = Array.from({ length: 20 }, () => b());
		expect(seqA).toEqual(seqB);
	});

	it('differs between seeds', () => {
		const a = mulberry32(7);
		const b = mulberry32(8);
		expect(a()).not.toBe(b());
	});
});
