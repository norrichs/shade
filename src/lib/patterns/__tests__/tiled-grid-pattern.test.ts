import type { GridVariant, PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import {
	adjustGridPatternAfterMapping,
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

const makeConfig = (
	rows: number,
	columns: number,
	variant: GridVariant,
	dropEdgeSegments: boolean
): TiledPatternConfig =>
	({
		type: 'tiledGridPattern-0',
		tiling: 'quadrilateral',
		config: {
			rowCount: rows,
			columnCount: columns,
			dynamicStroke: 'quadWidth',
			dynamicStrokeEasing: 'linear',
			dynamicStrokeMin: 1,
			dynamicStrokeMax: 3,
			endsMatched: false,
			endsTrimmed: true,
			endLooped: 0,
			variant,
			dropEdgeSegments,
			scaleConfig: { value: 1 }
		}
	}) as unknown as TiledPatternConfig;

/**
 * Stand-in for a mapped band: `transformPatternByQuad` maps element-wise, so an
 * untransformed copy of the unit path per quad has identical index structure.
 */
const makeBand = (quadCount: number, rows: number, columns: number, variant: GridVariant) =>
	Array.from(
		{ length: quadCount },
		() => generateGridPatternWithMeta({ size: 1, rows, columns, variant }).path
	);

const NO_QUADS: Quadrilateral[] = [];
const PARTNERED = { hasOuterPartner: true, bandIndex: 0 };

describe('adjustGridPatternAfterMapping', () => {
	it('is an identity when the flag is off', () => {
		const band = makeBand(6, 1, 1, 'rect');
		const result = adjustGridPatternAfterMapping(
			band,
			NO_QUADS,
			makeConfig(1, 1, 'rect', false),
			PARTNERED
		);
		expect(result).toEqual(band);
	});

	it('is an identity when the band has no outer partner', () => {
		const band = makeBand(6, 1, 1, 'rect');
		const result = adjustGridPatternAfterMapping(band, NO_QUADS, makeConfig(1, 1, 'rect', true), {
			hasOuterPartner: false,
			bandIndex: 3
		});
		expect(result).toEqual(band);
	});

	it('is an identity when no band context is supplied', () => {
		const band = makeBand(6, 1, 1, 'rect');
		expect(adjustGridPatternAfterMapping(band, NO_QUADS, makeConfig(1, 1, 'rect', true))).toEqual(
			band
		);
	});

	it('removes two segments from exactly the dropped quads at 1 row, 1 column', () => {
		const band = makeBand(6, 1, 1, 'rect');
		const before = band.map((facet) => facet.length);
		const result = adjustGridPatternAfterMapping(
			band,
			NO_QUADS,
			makeConfig(1, 1, 'rect', true),
			PARTNERED
		);
		const removed = result.map((facet, i) => before[i] - facet.length);
		// k = 1 and 3 are dropped; k = 5 (final quad) is exempt.
		expect(removed).toEqual([0, 2, 0, 2, 0, 0]);
	});

	it('removes one pair from every quad but the last at 2 rows, 2 columns', () => {
		const band = makeBand(6, 2, 2, 'rect');
		const before = band.map((facet) => facet.length);
		const result = adjustGridPatternAfterMapping(
			band,
			NO_QUADS,
			makeConfig(2, 2, 'rect', true),
			PARTNERED
		);
		expect(result.map((facet, i) => before[i] - facet.length)).toEqual([2, 2, 2, 2, 2, 0]);
	});

	it('alternates one and two pairs per quad at 3 rows, 2 columns', () => {
		const band = makeBand(6, 3, 2, 'rect');
		const before = band.map((facet) => facet.length);
		const result = adjustGridPatternAfterMapping(
			band,
			NO_QUADS,
			makeConfig(3, 2, 'rect', true),
			PARTNERED
		);
		// q0: k=1        -> 1 pair;  q1: k=3,5 -> 2 pairs;  q2: k=7 -> 1 pair;
		// q3: k=9,11     -> 2 pairs; q4: k=13  -> 1 pair;   q5: k=15 -> 1 pair (17 exempt).
		expect(result.map((facet, i) => before[i] - facet.length)).toEqual([2, 4, 2, 4, 2, 2]);
	});

	// Guards against collateral damage: the count assertions above pin down HOW MANY
	// segments go, this pins down that the survivors are the original path with
	// exactly the outer-edge indices removed, in their original order.
	it('removes exactly the expected indices and nothing else, for every variant', () => {
		for (const variant of VARIANTS) {
			const rows = 3;
			const columns = 2;
			const quadCount = 6;
			const { path, outerEdgeSegmentIndices } = generateGridPatternWithMeta({
				size: 1,
				rows,
				columns,
				variant
			});
			const dropped = getDroppedEdgeSegmentKeys(rows, quadCount);
			const result = adjustGridPatternAfterMapping(
				makeBand(quadCount, rows, columns, variant),
				NO_QUADS,
				makeConfig(rows, columns, variant, true),
				PARTNERED
			);
			result.forEach((facet, quadIndex) => {
				const remove = new Set<number>();
				for (let r = 0; r < rows; r++) {
					if (!dropped.has(quadIndex * rows + r)) continue;
					remove.add(outerEdgeSegmentIndices[r][0]);
					remove.add(outerEdgeSegmentIndices[r][1]);
				}
				expect(facet).toEqual(path.filter((_, index) => !remove.has(index)));
			});
		}
	});
});
