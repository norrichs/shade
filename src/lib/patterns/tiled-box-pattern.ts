import type { PathSegment } from '$lib/types';

export const generateBoxPattern = ({
	size = 1,
	height = 1,
	width = 2
}: {
	size?: number;
	height?: number;
	width?: number;
}) => {
	const rowHeight = size / height;
	const columnWidth = size / width;
	const v = rowHeight / 6;
	const h = columnWidth / 2;
	const segments: PathSegment[] = [];
	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			const r = rowHeight * row;
			const c = columnWidth * col;
			segments.push(
				...([
					['M', c + 0, r + v],
					['L', c + h, r + 0],
					['L', c + h, r + 2 * v],
					['L', c + 0, r + 3 * v],
					['Z'],
					['M', c + h, r + 0],
					['L', c + 2 * h, r + v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + h, r + 2 * v],
					['Z'],
					['M', c + 0, r + 3 * v],
					['L', c + h, r + 2 * v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + h, r + 4 * v],
					['Z'],
					['M', c + 0, r + 3 * v],
					['L', c + h, r + 4 * v],
					['L', c + h, r + 6 * v],
					['L', c + 0, r + 5 * v],
					['Z'],
					['M', c + h, r + 4 * v],
					['L', c + 2 * h, r + 3 * v],
					['L', c + 2 * h, r + 5 * v],
					['L', c + h, r + 6 * v],
					['Z']
				] as PathSegment[])
			);
		}
	}

	return segments;
};
