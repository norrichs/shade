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

/**
 * Which rows and columns a spec index expands to.
 *
 * `row` applies to middle-group indices only: a start-group index always
 * names row 0's start row and an end-group index the last row's end row, the
 * only rows where those groups are the band's ends.
 *
 * `column: 'side'` picks, per index, the column on the side of the tile the
 * index's unit vertex lies on: x left of the unit's centre → first column,
 * right of it → last column.
 */
export type IndexPlacement = {
	row: 'all' | 'last';
	column: 'all' | 'side';
};

const segmentEndX = (seg: PathSegment): number | undefined => {
	switch (seg[0]) {
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

const groupOf = (
	index: number,
	counts: Record<UnitGroup, number>
): { group: UnitGroup; local: number } => {
	if (index < 0 || index >= counts.start + counts.middle + counts.end) {
		throw new Error(`unit index ${index} is outside the unit`);
	}
	if (index < counts.start) return { group: 'start', local: index };
	if (index < counts.start + counts.middle) return { group: 'middle', local: index - counts.start };
	return { group: 'end', local: index - counts.start - counts.middle };
};

/**
 * Expand spec unit indices (start, middle, end concatenated, as a 1×1 tile
 * indexes them) into tiled-path indices, per `placement`. Each index expands
 * in column-then-row order, so two index lists that expand to the same number
 * of tiles pair up tile by tile.
 */
export const placeUnitIndices = (
	indices: number[],
	unit: UnitDefinition,
	layout: TesselationLayout,
	placement: IndexPlacement
): number[] => {
	const { rows, columns, counts, blocks } = layout;
	const byTile = new Map(blocks.map((b) => [`${b.group}:${b.row}:${b.column}`, b.offset]));
	const unitSegments = [...unit.start, ...unit.middle, ...unit.end];

	return indices.flatMap((index) => {
		const { group, local } = groupOf(index, counts);
		const tileRows =
			group === 'start'
				? [0]
				: group === 'end' || placement.row === 'last'
					? [rows - 1]
					: Array.from({ length: rows }, (_, r) => r);
		let tileColumns: number[];
		if (placement.column === 'all') {
			tileColumns = Array.from({ length: columns }, (_, c) => c);
		} else {
			const x = segmentEndX(unitSegments[index]);
			if (x === undefined) throw new Error(`unit index ${index} has no vertex to place by side`);
			tileColumns = [x < unit.width / 2 ? 0 : columns - 1];
		}
		return tileColumns.flatMap((column) =>
			tileRows.map((row) => {
				const offset = byTile.get(`${group}:${row}:${column}`);
				if (offset === undefined)
					throw new Error(`no ${group} block at row ${row}, column ${column}`);
				return offset + local;
			})
		);
	});
};
