import { centerSeamIndex } from '../seam-tab-layout';

describe('centerSeamIndex', () => {
	it('returns -1 when there are no seams (bandCount < 2)', () => {
		expect(centerSeamIndex(0)).toBe(-1);
		expect(centerSeamIndex(1)).toBe(-1);
	});
	it('returns the single middle seam for even bandCount', () => {
		expect(centerSeamIndex(2)).toBe(0);
		expect(centerSeamIndex(4)).toBe(1);
		expect(centerSeamIndex(6)).toBe(2);
	});
	it('returns the LOWER tied seam for odd bandCount', () => {
		expect(centerSeamIndex(3)).toBe(0);
		expect(centerSeamIndex(5)).toBe(1);
	});
});
