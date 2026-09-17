import { describe, it, expect } from '@jest/globals';
import type { PathSegment } from '$lib/types';
import type { TiledPatternSpec } from '../../../spec-types';
import { translatePS } from '../../../utils';
import { defaultShieldSpec } from '../../shield';
import { defaultHexSpec } from '../../hex';
import { defaultBoxSpec } from '../../box';
import { generateTesselationTile } from '../generator';
import { expandTesselationAdjustments } from '../adjuster';
import { scaleSegment } from '../helpers';
import { layoutTesselation, unitCounts, type UnitGroup } from '../layout';

/**
 * Task 17: spec adjustment rules name vertices of a 1×1 unit tile. On a
 * `rows × columns` tile each rule must land where the relationship it encodes
 * exists (controller ruling):
 *
 * - withinBand (this facet's end row meets the next facet's start row): the
 *   last row only, every column. Start-group sources are row 0.
 * - acrossBands and skipRemove (this band's side meets the neighbouring
 *   band's side): every row, only in the column on that side.
 * - partner end matching and end trimming: row 0's start group, the last
 *   row's end group, every column.
 *
 * Each expanded index is checked against the generated path: the path block
 * it falls in must be exactly the named unit group, scaled and translated to
 * the expected tile, with the index at the right place inside it.
 */

const SIZE = 100;

type Tile = { row: number; column: number };

const groupOf = (spec: TiledPatternSpec, index: number): { group: UnitGroup; local: number } => {
	const { start, middle } = spec.unit;
	if (index < start.length) return { group: 'start', local: index };
	if (index < start.length + middle.length) return { group: 'middle', local: index - start.length };
	return { group: 'end', local: index - start.length - middle.length };
};

const tileGroup = (
	spec: TiledPatternSpec,
	rows: number,
	columns: number,
	group: UnitGroup,
	{ row, column }: Tile
): PathSegment[] => {
	const rowH = SIZE / rows;
	const colW = SIZE / columns;
	const w = colW / spec.unit.width;
	const h = rowH / spec.unit.height;
	return translatePS(
		spec.unit[group].map((s) => scaleSegment(s, w, h)),
		colW * column,
		rowH * row
	);
};

const allColumns = (columns: number) => Array.from({ length: columns }, (_, c) => c);
const allRows = (rows: number) => Array.from({ length: rows }, (_, r) => r);

/** Expected tiles for one unit index, in expansion order (column, then row). */
type TilesFor = (index: number) => Tile[];

const withinBandTiles =
	(spec: TiledPatternSpec, rows: number, columns: number): TilesFor =>
	(index) =>
		allColumns(columns).map((column) => ({
			row: groupOf(spec, index).group === 'start' ? 0 : rows - 1,
			column
		}));

const endTiles =
	(spec: TiledPatternSpec, rows: number, columns: number): TilesFor =>
	(index) => {
		const { group } = groupOf(spec, index);
		if (group === 'middle') throw new Error(`end rule names middle index ${index}`);
		return allColumns(columns).map((column) => ({ row: group === 'start' ? 0 : rows - 1, column }));
	};

const sideTiles =
	(rows: number, column: number): TilesFor =>
	() =>
		allRows(rows).map((row) => ({ row, column }));

const describeMismatch = (
	spec: TiledPatternSpec,
	path: PathSegment[],
	rows: number,
	columns: number,
	unitIndices: number[],
	expanded: number[],
	tilesFor: TilesFor
): string[] => {
	const expected = unitIndices.flatMap((index) => tilesFor(index).map((tile) => ({ index, tile })));
	if (expected.length !== expanded.length) {
		return [`expanded ${expanded.length} indices, expected ${expected.length}`];
	}
	return expected.flatMap(({ index, tile }, i) => {
		const { group, local } = groupOf(spec, index);
		const want = tileGroup(spec, rows, columns, group, tile);
		const at = expanded[i];
		const block = path.slice(at - local, at - local + want.length);
		const close =
			block.length === want.length &&
			block.every(
				(seg, s) =>
					seg[0] === want[s][0] &&
					seg.length === want[s].length &&
					seg.every((v, k) => k === 0 || Math.abs((v as number) - (want[s][k] as number)) < 1e-9)
			);
		return close
			? []
			: [
					`unit ${index} (${group}[${local}]) → ${at} is not row ${tile.row} column ${tile.column}: got ${JSON.stringify(path[at])}, want ${JSON.stringify(want[local])}`
				];
	});
};

const check = (spec: TiledPatternSpec, rows: number, columns: number) => {
	const path = generateTesselationTile(spec, {
		size: SIZE,
		rows,
		columns,
		variant: 'rect',
		sideOrientation: 'outside'
	});
	const x = expandTesselationAdjustments(spec, rows, columns);
	const a = spec.adjustments;
	const failures: Record<string, string[]> = {
		withinBandSources: describeMismatch(
			spec,
			path,
			rows,
			columns,
			a.withinBand.map((p) => p.source),
			x.withinBand.map((p) => p.source),
			withinBandTiles(spec, rows, columns)
		),
		withinBandTargets: describeMismatch(
			spec,
			path,
			rows,
			columns,
			a.withinBand.map((p) => p.target),
			x.withinBand.map((p) => p.target),
			withinBandTiles(spec, rows, columns)
		),
		// The previous band's joining side is its last column; this band's is its first.
		acrossBandsSources: describeMismatch(
			spec,
			path,
			rows,
			columns,
			a.acrossBands.map((p) => p.source),
			x.acrossBands.map((p) => p.source),
			sideTiles(rows, columns - 1)
		),
		acrossBandsTargets: describeMismatch(
			spec,
			path,
			rows,
			columns,
			a.acrossBands.map((p) => p.target),
			x.acrossBands.map((p) => p.target),
			sideTiles(rows, 0)
		),
		skipRemove: describeMismatch(
			spec,
			path,
			rows,
			columns,
			a.skipRemove,
			x.skipRemove,
			sideTiles(rows, 0)
		),
		...Object.fromEntries(
			(['start', 'end'] as const).flatMap((end) => {
				const pairs = end === 'start' ? a.partner.startEnd : a.partner.endEnd;
				return [
					[
						`partnerTargets.${end}`,
						describeMismatch(
							spec,
							path,
							rows,
							columns,
							pairs.map((p) => p.target),
							x.partnerTargets[end],
							endTiles(spec, rows, columns)
						)
					],
					[
						`partnerSources.${end}`,
						describeMismatch(
							spec,
							path,
							rows,
							columns,
							pairs.map((p) => p.source),
							x.partnerSources[end],
							endTiles(spec, rows, columns)
						)
					]
				];
			})
		),
		trimStart: describeMismatch(
			spec,
			path,
			rows,
			columns,
			spec.unit.start.map((_, i) => i),
			x.trim.start,
			endTiles(spec, rows, columns)
		),
		trimEnd: describeMismatch(
			spec,
			path,
			rows,
			columns,
			spec.unit.end.map((_, i) => spec.unit.start.length + spec.unit.middle.length + i),
			x.trim.end,
			endTiles(spec, rows, columns)
		)
	};
	return { path, expanded: x, failures };
};

const noFailures = (failures: Record<string, string[]>) =>
	Object.fromEntries(Object.entries(failures).filter(([, f]) => f.length > 0));

const pointOf = (seg: PathSegment) => ({ x: seg[1] as number, y: seg[2] as number });

describe('fixture: the Shield rules sit on the boundaries the rulings assume', () => {
	const unit = [
		...defaultShieldSpec.unit.start,
		...defaultShieldSpec.unit.middle,
		...defaultShieldSpec.unit.end
	];
	const { width, height } = defaultShieldSpec.unit;
	const { adjustments: a } = defaultShieldSpec;

	it('across-band and skipRemove targets lie on the left side, sources on the right', () => {
		for (const t of [...a.acrossBands.map((p) => p.target), ...a.skipRemove]) {
			expect(Math.abs(pointOf(unit[t]).x)).toBeLessThanOrEqual(2);
		}
		for (const s of a.acrossBands.map((p) => p.source)) {
			expect(Math.abs(pointOf(unit[s]).x - width)).toBeLessThanOrEqual(2);
		}
	});

	it('within-band middle targets lie next to the end row', () => {
		const middleTargets = a.withinBand
			.map((p) => p.target)
			.filter((t) => groupOf(defaultShieldSpec, t).group === 'middle');
		expect(middleTargets.length).toBeGreaterThan(0);
		for (const t of middleTargets) {
			expect(Math.abs(pointOf(unit[t]).y - height)).toBeLessThanOrEqual(2);
		}
	});

	it('the rules use start, middle and end indices', () => {
		const groups = new Set(
			[
				...a.withinBand.flatMap((p) => [p.source, p.target]),
				...a.acrossBands.flatMap((p) => [p.source, p.target]),
				...a.skipRemove
			].map((i) => groupOf(defaultShieldSpec, i).group)
		);
		expect([...groups].sort()).toEqual(['end', 'middle', 'start']);
	});
});

describe('Shield rules expand onto the geometrically correct tiles', () => {
	it.each([
		[1, 2],
		[2, 1],
		[2, 2],
		[3, 2]
	])('%i rows × %i columns', (rows, columns) => {
		const { path, failures } = check(defaultShieldSpec, rows, columns);
		expect(noFailures(failures)).toEqual({});
		// The start/end rows really are the band's ends: start-group partner
		// indices at y≈0 and end-group ones at y≈SIZE (the unit's end rows bulge
		// by at most 2/14 of a row).
		const rowSlack = (2 / defaultShieldSpec.unit.height) * (SIZE / rows) + 1e-9;
		const x = expandTesselationAdjustments(defaultShieldSpec, rows, columns);
		for (const i of [...x.partnerTargets.start, ...x.partnerSources.start]) {
			expect(Math.abs(pointOf(path[i]).y)).toBeLessThanOrEqual(rowSlack);
		}
		for (const i of [...x.partnerTargets.end, ...x.partnerSources.end]) {
			expect(Math.abs(pointOf(path[i]).y - SIZE)).toBeLessThanOrEqual(rowSlack);
		}
	});
});

describe('Hex rules (start/end groups only) expand onto the band end rows', () => {
	it.each([
		[2, 1],
		[2, 2],
		[3, 2]
	])('%i rows × %i columns', (rows, columns) => {
		const { failures } = check(defaultHexSpec, rows, columns);
		expect(noFailures(failures)).toEqual({});
	});
});

describe('guards: expansions that were already correct stay as they were', () => {
	it('Shield 1×1 is the identity', () => {
		const { failures, expanded } = check(defaultShieldSpec, 1, 1);
		expect(noFailures(failures)).toEqual({});
		expect(expanded.withinBand).toEqual(defaultShieldSpec.adjustments.withinBand);
		expect(expanded.acrossBands).toEqual(defaultShieldSpec.adjustments.acrossBands);
		expect(expanded.skipRemove).toEqual(defaultShieldSpec.adjustments.skipRemove);
	});

	// Hex rules name only start/end groups, whose 1×N expansion was correct.
	it.each([
		[1, [0, 2, 1, 3], [20, 22, 21, 23]],
		[2, [0, 2, 4, 1, 3, 5], [30, 32, 34, 31, 33, 35]]
	])('Hex 1×%i start/end expansions are unchanged', (extra, starts, ends) => {
		const columns = extra + 1;
		const { failures, expanded } = check(defaultHexSpec, 1, columns);
		expect(noFailures(failures)).toEqual({});
		expect(expanded.withinBand).toEqual(starts.map((source, i) => ({ source, target: ends[i] })));
		expect(expanded.trim).toEqual({ start: starts, end: ends });
	});
});

describe('guard: the layout describes exactly the path the generator emits', () => {
	const specs = [defaultShieldSpec, defaultHexSpec, defaultBoxSpec];
	it.each(specs.flatMap((spec) => [1, 2, 3].flatMap((r) => [1, 2, 3].map((c) => [spec.id, r, c]))))(
		'%s %i×%i',
		(id, rows, columns) => {
			const spec = specs.find((s) => s.id === id)!;
			const path = generateTesselationTile(spec, {
				size: SIZE,
				rows: rows as number,
				columns: columns as number,
				variant: 'rect',
				sideOrientation: 'outside'
			});
			const layout = layoutTesselation(unitCounts(spec.unit), rows as number, columns as number);
			for (const block of layout.blocks) {
				const want = tileGroup(spec, rows as number, columns as number, block.group, block);
				expect(path.slice(block.offset, block.offset + want.length)).toEqual(want);
			}
			const extras =
				(rows as number) *
				((spec.unit.firstColumn?.length ?? 0) + (spec.unit.lastColumn?.length ?? 0));
			expect(path.length).toBe(layout.length + extras);
		}
	);
});
