import type { PathSegment } from '$lib/types';
import type { UnitDefinition } from '../../spec-types';

/** One of the three index groups of a tesselation unit tile. */
export type UnitGroup = 'start' | 'middle' | 'end';

/** One unit group of one (row, column) tile, placed at `offset` in the tiled path. */
export type TileBlock = {
	group: UnitGroup;
	row: number;
	column: number;
	offset: number;
};

/**
 * Where every unit group of every tile sits in a `rows × columns` tiled path.
 *
 * The generator assembles its path from these blocks, in this order, so the
 * adjuster's index expansion cannot drift from the path it indexes:
 *
 * - starts: per column, the start group of row 0 (the band's start row);
 * - middles: per column, row by row —
 *   one row: [middle];
 *   first row of several: [end, middle];
 *   interior rows: [start, middle, end];
 *   last row of several: [start, middle];
 * - ends: per column, the end group of the last row (the band's end row).
 *
 * Only row 0's start group and the last row's end group lie on the tile's end
 * rows; the start/end groups of other rows are interior tile-to-tile rows and
 * are laid out among the middles.
 */
export type TesselationLayout = {
	rows: number;
	columns: number;
	counts: Record<UnitGroup, number>;
	blocks: TileBlock[];
	/** Total indexed segments (excluding `firstColumn`/`lastColumn` extras, which follow). */
	length: number;
};

export const layoutTesselation = (
	counts: Record<UnitGroup, number>,
	rows: number,
	columns: number
): TesselationLayout => {
	const order: Omit<TileBlock, 'offset'>[] = [];
	for (let column = 0; column < columns; column++) {
		order.push({ group: 'start', row: 0, column });
	}
	for (let column = 0; column < columns; column++) {
		for (let row = 0; row < rows; row++) {
			const groups: UnitGroup[] =
				rows === 1
					? ['middle']
					: row === 0
						? ['end', 'middle']
						: row === rows - 1
							? ['start', 'middle']
							: ['start', 'middle', 'end'];
			for (const group of groups) order.push({ group, row, column });
		}
	}
	for (let column = 0; column < columns; column++) {
		order.push({ group: 'end', row: rows - 1, column });
	}

	let offset = 0;
	const blocks = order.map((block) => {
		const placed = { ...block, offset };
		offset += counts[block.group];
		return placed;
	});
	return { rows, columns, counts, blocks, length: offset };
};

export const unitCounts = (unit: UnitDefinition): Record<UnitGroup, number> => ({
	start: unit.start.length,
	middle: unit.middle.length,
	end: unit.end.length
});

const segmentEndX = (seg: PathSegment | undefined): number | undefined => {
	switch (seg?.[0]) {
		case 'M':
		case 'L':
			return seg[1];
		case 'Q':
			return seg[3];
		case 'C':
			return seg[5];
		case 'A':
			return seg[6];
		default:
			return undefined;
	}
};

/** A unit index's group and its offset inside that group. */
export type UnitIndex = { index: number; group: UnitGroup; local: number };

/**
 * Which group a 1×1 unit index (start, middle, end concatenated) belongs to,
 * or undefined for an index outside the unit.
 */
export const unitIndexOf = (
	index: number,
	counts: Record<UnitGroup, number>
): UnitIndex | undefined => {
	if (!Number.isInteger(index) || index < 0) return undefined;
	if (index < counts.start) return { index, group: 'start', local: index };
	if (index < counts.start + counts.middle) {
		return { index, group: 'middle', local: index - counts.start };
	}
	if (index < counts.start + counts.middle + counts.end) {
		return { index, group: 'end', local: index - counts.start - counts.middle };
	}
	return undefined;
};

/** The tiled-path index of `unitIndex` in the tile at (`row`, `column`). */
export const tiledIndex = (
	layout: TesselationLayout,
	{ group, local }: UnitIndex,
	row: number,
	column: number
): number => {
	const block = layout.blocks.find(
		(b) => b.group === group && b.row === row && b.column === column
	);
	if (!block) throw new Error(`no ${group} block at row ${row}, column ${column}`);
	return block.offset + local;
};

/**
 * The column on the side of the tile a unit vertex lies on: x left of the
 * unit's centre → the first column, otherwise the last. A segment with no
 * vertex (`Z`) counts as the first column.
 */
export const sideColumn = (unit: UnitDefinition, index: number, columns: number): number => {
	const x = segmentEndX([...unit.start, ...unit.middle, ...unit.end][index]);
	return x !== undefined && x >= unit.width / 2 ? columns - 1 : 0;
};
