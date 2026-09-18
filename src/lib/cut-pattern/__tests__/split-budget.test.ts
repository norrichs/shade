import { describe, it, expect } from '@jest/globals';

import { computeSplitBudget, EMPTY_SPLIT_BUDGET } from '../split-budget';

/**
 * The budget the Splits panel hands `deriveAutoSplits`, and the preconditions it
 * gates the Auto-split button on.
 *
 * Every number here is in pattern units, the space the layout measures in
 * (`flex-wrap.ts:20-21`, `skyline.ts:113-124`). `height` / `width` are EFFECTIVE
 * bounds — geometry plus the external self-tag footprint, exactly what
 * `toLayoutItems` feeds the layout — and `rawHeight` is `band.bounds.height`, so
 * their difference IS the per-piece footprint the layout adds.
 */
const geom = { contentWidth: 100, contentHeight: 200, allowRotation: false };

describe('computeSplitBudget — the per-piece footprint', () => {
	it('reports nothing measured for an empty band list', () => {
		expect(computeSplitBudget([], geom)).toEqual(EMPTY_SPLIT_BUDGET);
	});

	it('is zero when effective bounds equal the raw geometry (a tiled band has no self tag)', () => {
		const budget = computeSplitBudget([{ width: 50, height: 150, rawHeight: 150 }], geom);
		expect(budget.perPieceFootprint).toBe(0);
		expect(budget.pieceLengthBudget).toBe(200);
	});

	it('is the vertical overhang of the self-tag label beyond the geometry', () => {
		// 150 of geometry inside a 168-unit effective box: the tag adds 18.
		const budget = computeSplitBudget([{ width: 50, height: 168, rawHeight: 150 }], geom);
		expect(budget.perPieceFootprint).toBe(18);
		// Every new piece carries its own tag, so the budget for one piece's raw
		// geometry is the content box less that footprint.
		expect(budget.pieceLengthBudget).toBe(182);
	});

	it('takes the LARGEST footprint across bands, so the budget is safe for every piece', () => {
		const budget = computeSplitBudget(
			[
				{ width: 50, height: 155, rawHeight: 150 },
				{ width: 50, height: 180, rawHeight: 150 },
				{ width: 50, height: 160, rawHeight: 150 }
			],
			geom
		);
		expect(budget.perPieceFootprint).toBe(30);
		expect(budget.pieceLengthBudget).toBe(170);
	});

	it('never goes negative when effective bounds are somehow smaller than the geometry', () => {
		const budget = computeSplitBudget([{ width: 50, height: 140, rawHeight: 150 }], geom);
		expect(budget.perPieceFootprint).toBe(0);
	});

	it('ignores non-finite measurements rather than poisoning the budget with NaN', () => {
		const budget = computeSplitBudget(
			[
				{ width: 50, height: Number.NaN, rawHeight: 150 },
				{ width: 50, height: 170, rawHeight: 150 }
			],
			geom
		);
		expect(budget.perPieceFootprint).toBe(20);
		expect(budget.pieceLengthBudget).toBe(180);
	});
});

describe('computeSplitBudget — the preconditions', () => {
	it('reports no overflow when every band fits the content box', () => {
		const budget = computeSplitBudget([{ width: 50, height: 150, rawHeight: 150 }], geom);
		expect(budget.lengthOverflow).toBe(false);
		expect(budget.widthBlocked).toBe(false);
	});

	it('reports a length overflow when a band is too long but narrow enough', () => {
		const budget = computeSplitBudget([{ width: 50, height: 400, rawHeight: 400 }], geom);
		expect(budget.lengthOverflow).toBe(true);
		expect(budget.widthBlocked).toBe(false);
	});

	it('reports width-blocked, not length overflow, when a band is too wide — no split can help', () => {
		const budget = computeSplitBudget([{ width: 400, height: 400, rawHeight: 400 }], geom);
		expect(budget.widthBlocked).toBe(true);
		expect(budget.lengthOverflow).toBe(false);
	});

	it('is width-blocked even when the band is short, because splitting only shortens', () => {
		const budget = computeSplitBudget([{ width: 400, height: 50, rawHeight: 50 }], geom);
		expect(budget.widthBlocked).toBe(true);
		expect(budget.lengthOverflow).toBe(false);
	});

	it('reports both when one band is too wide and another merely too long', () => {
		const budget = computeSplitBudget(
			[
				{ width: 400, height: 50, rawHeight: 50 },
				{ width: 50, height: 400, rawHeight: 400 }
			],
			geom
		);
		expect(budget.widthBlocked).toBe(true);
		expect(budget.lengthOverflow).toBe(true);
	});

	it('does not call a band overflowing when rotation is allowed and it fits rotated', () => {
		// 180 wide × 90 tall: too wide upright, but 90 × 180 fits the 100 × 200 box.
		const rotating = { ...geom, allowRotation: true };
		const budget = computeSplitBudget([{ width: 180, height: 90, rawHeight: 90 }], rotating);
		expect(budget.lengthOverflow).toBe(false);
		expect(budget.widthBlocked).toBe(false);
	});

	it('still reports the same band as overflowing when rotation is off', () => {
		const budget = computeSplitBudget([{ width: 180, height: 90, rawHeight: 90 }], geom);
		expect(budget.widthBlocked).toBe(true);
	});

	it('reports a length overflow when rotation is allowed but neither orientation fits', () => {
		const rotating = { ...geom, allowRotation: true };
		// 50 × 400: upright it is too long; rotated it is 400 wide, past contentWidth.
		const budget = computeSplitBudget([{ width: 50, height: 400, rawHeight: 400 }], rotating);
		expect(budget.lengthOverflow).toBe(true);
		expect(budget.widthBlocked).toBe(false);
	});

	it('marks itself measured whenever it saw at least one band', () => {
		expect(computeSplitBudget([{ width: 1, height: 1, rawHeight: 1 }], geom).measured).toBe(true);
	});
});
