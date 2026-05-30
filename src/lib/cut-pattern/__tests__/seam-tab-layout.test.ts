import { centerSeamIndex, seamTabOwner } from '../seam-tab-layout';

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

describe('seamTabOwner', () => {
	// Worked example from the spec: before + inner, 6 bands (centerSeam = 2).
	it('reproduces the before+inner worked example for a 6-band tube', () => {
		const owners = (s: number) => seamTabOwner(s, 6, 'inner', 'before');
		expect(owners(0)).toEqual([{ band: 1, edge: 'before' }]);
		expect(owners(1)).toEqual([{ band: 2, edge: 'before' }]);
		expect(owners(2)).toEqual([{ band: 3, edge: 'before' }]); // center, before
		expect(owners(3)).toEqual([{ band: 3, edge: 'after' }]);
		expect(owners(4)).toEqual([{ band: 4, edge: 'after' }]);
	});

	it('center seam honors after', () => {
		// 6 bands, centerSeam = 2, after => band 2 on its after edge.
		expect(seamTabOwner(2, 6, 'inner', 'after')).toEqual([{ band: 2, edge: 'after' }]);
		expect(seamTabOwner(2, 6, 'outer', 'after')).toEqual([{ band: 2, edge: 'after' }]);
	});

	it('center seam honors beforeAndAfter (two owners)', () => {
		expect(seamTabOwner(2, 6, 'inner', 'beforeAndAfter')).toEqual([
			{ band: 3, edge: 'before' },
			{ band: 2, edge: 'after' }
		]);
	});

	it('center seam with undefined bandEdge yields no owner', () => {
		expect(seamTabOwner(2, 6, 'inner', undefined)).toEqual([]);
	});

	it('outer is the mirror of inner for every non-center seam', () => {
		const bandCount = 6;
		const center = centerSeamIndex(bandCount); // 2
		for (let s = 0; s <= bandCount - 2; s++) {
			if (s === center) continue;
			const inner = seamTabOwner(s, bandCount, 'inner', 'before');
			const outer = seamTabOwner(s, bandCount, 'outer', 'before');
			// Both own exactly one of {band s on 'after', band s+1 on 'before'};
			// outer picks the opposite of inner.
			expect(inner.length).toBe(1);
			expect(outer.length).toBe(1);
			expect(outer[0]).not.toEqual(inner[0]);
			const allowed = [
				{ band: s, edge: 'after' },
				{ band: s + 1, edge: 'before' }
			];
			expect(allowed).toContainEqual(inner[0]);
			expect(allowed).toContainEqual(outer[0]);
		}
	});

	it('center seam is identical for inner and outer (governed by bandEdge)', () => {
		const center = centerSeamIndex(6);
		expect(seamTabOwner(center, 6, 'inner', 'before')).toEqual(
			seamTabOwner(center, 6, 'outer', 'before')
		);
	});
});
