import type { HexPattern } from './quadrilateral';

export const generateHexPattern = ({
	variant,
	size
}: {
	variant: 0 | 1;
	size: number;
}): HexPattern => {
	const unit = size / 3;
	const h = size / 4;
	const segments: { [key: number]: HexPattern } = {
		0: [
			['M', 0, unit / 2],
			['L', h, 0],
			['L', 2 * h, unit / 2],
			['L', 3 * h, 0],
			['L', 4 * h, unit / 2],

			['M', 0, unit / 2],
			['L', 0, (3 * unit) / 2],

			['M', 2 * h, unit / 2],
			['L', 2 * h, (3 * unit) / 2],

			['M', 4 * h, unit / 2],
			['L', 4 * h, (3 * unit) / 2],

			['M', 0, (3 * unit) / 2],
			['L', h, 2 * unit],
			['L', 2 * h, (3 * unit) / 2],
			['L', 3 * h, 2 * unit],
			['L', 4 * h, (3 * unit) / 2],

			['M', h, 2 * unit],
			['L', h, 3 * unit],

			['M', 3 * h, 2 * unit],
			['L', 3 * h, 3 * unit]
		],
		1: [
			['M', 0, unit],
			['L', h, unit / 2],
			['L', 2 * h, unit],
			['L', 3 * h, unit / 2],
			['L', 4 * h, unit],

			['L', 4 * h, 2 * unit],
			['L', 3 * h, (5 * unit) / 2],
			['L', 2 * h, 2 * unit],
			['L', h, (5 * unit) / 2],
			['L', 0, 2 * unit],
			['L', 0, unit],

			// Center segment
			['M', 2 * h, unit],
			['L', 2 * h, 2 * unit],

			// Top segments
			['M', h, unit / 2],
			['L', h, 0],

			['M', 3 * h, unit / 2],
			['L', 3 * h, 0],

			// Bottom segments
			['M', h, (5 * unit) / 2],
			['L', h, 3 * unit],

			['M', 3 * h, (5 * unit) / 2],
			['L', 3 * h, 3 * unit]
		]
	};
	return segments[variant];
};
