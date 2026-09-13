import type { PathSegment } from '$lib/types';
import {
	HEXPARQUET_SUBUNIT_COUNT,
	generateHexparquetPreview,
	generateHexparquetSubunits,
	getHexparquetAcrossBandPairs,
	getHexparquetDropIndices,
	getHexparquetSnapRules
} from '../tiled-hexparquet-pattern';

const BLUE = 0;
const GREEN = 1;
const RED = 2;
const node = (seg: PathSegment) => [seg[1] as number, seg[2] as number];

describe('generateHexparquetSubunits', () => {
	it('emits blue, green, red with 10, 9, 10 segments per column', () => {
		for (const columns of [1, 2, 3]) {
			const [blue, green, red] = generateHexparquetSubunits(columns);
			expect(blue).toHaveLength(20 * columns);
			expect(green).toHaveLength(18 * columns);
			expect(red).toHaveLength(20 * columns);
		}
		expect(HEXPARQUET_SUBUNIT_COUNT).toBe(3);
	});

	it('emits every segment as an M/L pair', () => {
		for (const path of generateHexparquetSubunits(2)) {
			path.forEach((seg, i) => expect(seg[0]).toBe(i % 2 === 0 ? 'M' : 'L'));
		}
	});

	it('places the left apex at x = -1/6 of a column', () => {
		const [, green] = generateHexparquetSubunits(1);
		expect(node(green[1])).toEqual([-1 / 6, 0.5]); // segment 0 end: 0,1 → ◀½
	});

	it('scales and offsets columns', () => {
		const [, green] = generateHexparquetSubunits(2);
		// column 1, segment 0 starts at unit (0, 1) → x = (1 + 0) / 2
		expect(node(green[18])).toEqual([0.5, 1]);
	});
});

describe('generateHexparquetPreview', () => {
	it('stacks the three subunits into thirds of one unit', () => {
		const preview = generateHexparquetPreview(1);
		expect(preview).toHaveLength(20 + 18 + 20);
		const ys = preview.map((seg) => seg[2] as number);
		expect(Math.min(...ys)).toBeCloseTo(0);
		expect(Math.max(...ys)).toBeCloseTo(1);
	});
});

describe('getHexparquetSnapRules', () => {
	const columns = 2;
	const [blue, green, red] = generateHexparquetSubunits(columns);
	const rules = getHexparquetSnapRules(columns);

	it("snaps green's up node onto the next (red) facet's right apex in each column", () => {
		const next = rules(GREEN).find((r) => r.from === 'next');
		expect(next?.pairs).toHaveLength(columns);
		next!.pairs.forEach(({ target, source }, c) => {
			expect(node(green[target])).toEqual([(c + 4 / 6) / columns, 1]);
			expect(node(red[source])).toEqual([(c + 5 / 6) / columns, 0.5]);
		});
	});

	it("snaps green's down node onto the previous (blue) facet's right apex in each column", () => {
		const prev = rules(GREEN).find((r) => r.from === 'prev');
		expect(prev?.pairs).toHaveLength(columns);
		prev!.pairs.forEach(({ target, source }, c) => {
			expect(node(green[target])).toEqual([(c + 4 / 6) / columns, 0]);
			expect(node(blue[source])).toEqual([(c + 5 / 6) / columns, 0.5]);
		});
	});

	it('snaps every left apex in column c > 0 onto column c-1 right apex of the same facet', () => {
		for (const [facetIndex, path] of [
			[BLUE, blue],
			[GREEN, green],
			[RED, red]
		] as const) {
			const self = rules(facetIndex).find((r) => r.from === 'self');
			expect(self?.pairs.length).toBeGreaterThan(0);
			for (const { target, source } of self!.pairs) {
				expect(node(path[target])[0]).toBeCloseTo((1 - 1 / 6) / columns);
				expect(node(path[source])).toEqual([(0 + 5 / 6) / columns, 0.5]);
			}
		}
	});

	it('has no prev/next rules on blue and red facets and no self rules with one column', () => {
		expect(rules(BLUE).filter((r) => r.from !== 'self')).toEqual([]);
		expect(rules(RED + 3).filter((r) => r.from !== 'self')).toEqual([]);
		expect(getHexparquetSnapRules(1)(BLUE)).toEqual([]);
	});
});

describe('getHexparquetAcrossBandPairs', () => {
	it("targets column 0's left apexes and sources the last column's right apex", () => {
		const columns = 2;
		const [, green] = generateHexparquetSubunits(columns);
		const pairs = getHexparquetAcrossBandPairs(GREEN, columns);
		expect(pairs).toHaveLength(3); // green has three ◀ nodes in column 0
		for (const { target, source } of pairs) {
			expect(node(green[target])[0]).toBeCloseTo(-1 / 6 / columns);
			expect(node(green[source])).toEqual([(1 + 5 / 6) / columns, 0.5]);
		}
	});
});

describe('getHexparquetDropIndices', () => {
	it('keeps everything on the first blue facet with one column and no partner', () => {
		expect(getHexparquetDropIndices(BLUE, 1, { hasLeftPartner: false })).toEqual([]);
	});

	it("drops blue's unit-bottom line on every blue facet after the first", () => {
		expect(getHexparquetDropIndices(BLUE + 3, 1, { hasLeftPartner: false })).toEqual([8, 9]);
	});

	it("drops green's lower-left segment in column 0 only when there is a left partner", () => {
		expect(getHexparquetDropIndices(GREEN, 1, { hasLeftPartner: false })).toEqual([]);
		expect(getHexparquetDropIndices(GREEN, 1, { hasLeftPartner: true })).toEqual([2, 3]);
	});

	it('drops the left-edge segments of columns after the first', () => {
		// green column 1: segments 0 and 1 → indices 2*(9+0)..2*(9+1)+1
		expect(getHexparquetDropIndices(GREEN, 2, { hasLeftPartner: false })).toEqual([18, 19, 20, 21]);
	});
});
