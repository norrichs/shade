import type { GridVariant, PathSegment } from '$lib/types';
import {
	generateGridPattern,
	generateGridPatternWithMeta,
	getDroppedEdgeSegmentKeys
} from '../tiled-grid-pattern';

const VARIANTS: GridVariant[] = ['rect', 'triangle-0', 'triangle-1'];
const SIZE = 1;

describe('generateGridPatternWithMeta', () => {
	it('produces the same path as generateGridPattern', () => {
		for (const variant of VARIANTS) {
			for (const rows of [1, 2, 3]) {
				for (const columns of [1, 2, 3]) {
					const { path } = generateGridPatternWithMeta({ size: SIZE, rows, columns, variant });
					expect(path).toEqual(generateGridPattern({ size: SIZE, rows, columns, variant }));
				}
			}
		}
	});

	it('reports one [M, L] index pair per row', () => {
		for (const variant of VARIANTS) {
			for (const rows of [1, 2, 3]) {
				for (const columns of [1, 2, 3]) {
					const { outerEdgeSegmentIndices } = generateGridPatternWithMeta({
						size: SIZE,
						rows,
						columns,
						variant
					});
					expect(outerEdgeSegmentIndices).toHaveLength(rows);
					for (const pair of outerEdgeSegmentIndices) {
						expect(pair).toHaveLength(2);
					}
				}
			}
		}
	});

	it('indexes a vertical segment on the outer edge (x === size) at the row height', () => {
		for (const variant of VARIANTS) {
			for (const rows of [1, 2, 3]) {
				for (const columns of [1, 2, 3]) {
					const { path, outerEdgeSegmentIndices } = generateGridPatternWithMeta({
						size: SIZE,
						rows,
						columns,
						variant
					});
					const rowHeight = SIZE / rows;
					outerEdgeSegmentIndices.forEach(([moveIndex, lineIndex], r) => {
						const move = path[moveIndex] as PathSegment;
						const line = path[lineIndex] as PathSegment;
						expect(move[0]).toBe('M');
						expect(line[0]).toBe('L');
						// Both endpoints sit on the outer edge of the unit square.
						expect(move[1] as number).toBeCloseTo(SIZE);
						expect(line[1] as number).toBeCloseTo(SIZE);
						// The pair spans exactly row r.
						expect(move[2] as number).toBeCloseTo(rowHeight * r);
						expect(line[2] as number).toBeCloseTo(rowHeight * (r + 1));
					});
				}
			}
		}
	});

	it('reports distinct indices across rows', () => {
		const { outerEdgeSegmentIndices } = generateGridPatternWithMeta({
			size: SIZE,
			rows: 3,
			columns: 2,
			variant: 'rect'
		});
		const flat = outerEdgeSegmentIndices.flat();
		expect(new Set(flat).size).toBe(flat.length);
	});
});

describe('getDroppedEdgeSegmentKeys', () => {
	it('drops every other quad, never the last, for 1 row', () => {
		expect([...getDroppedEdgeSegmentKeys(1, 6)].sort((a, b) => a - b)).toEqual([1, 3]);
	});

	it('drops exactly one per quad, always the second row, for 2 rows', () => {
		expect([...getDroppedEdgeSegmentKeys(2, 6)].sort((a, b) => a - b)).toEqual([1, 3, 5, 7, 9]);
	});

	it('alternates 1 / 2 drops per quad for 3 rows', () => {
		expect([...getDroppedEdgeSegmentKeys(3, 6)].sort((a, b) => a - b)).toEqual([
			1, 3, 5, 7, 9, 11, 13, 15
		]);
	});

	it('exempts the final row of the final quad', () => {
		expect(getDroppedEdgeSegmentKeys(1, 6).has(5)).toBe(false);
		expect(getDroppedEdgeSegmentKeys(2, 6).has(11)).toBe(false);
		expect(getDroppedEdgeSegmentKeys(3, 6).has(17)).toBe(false);
	});

	it('never drops the first row of a quad when rows === 2', () => {
		for (const k of getDroppedEdgeSegmentKeys(2, 6)) {
			expect(k % 2).toBe(1); // r = k % rows = 1, i.e. the second row
		}
	});

	it('returns an empty set for a single-quad band', () => {
		expect(getDroppedEdgeSegmentKeys(1, 1).size).toBe(0);
	});
});
