import type { PathSegment } from '$lib/types';

export const generateAuxetic = ({
	size,
	rows,
	columns
}: {
	size: number;
	rows: number;
	columns: number;
}): PathSegment[] => {
	const unit = size;
	const w = unit / 2 / columns;
	const h = unit / 4 / rows;
	const colW = unit / columns;
	const rowH = unit / rows;

	const units: PathSegment[] = [];
	const stems: PathSegment[] = [];

	for (let row = 0; row < rows; row++) {
		const leftToRight: PathSegment[] = [];
		const rightToLeft: PathSegment[] = [];
		const down: PathSegment[] = [];
		const up: PathSegment[] = [];
		down.push(['L', unit, row * rowH + 3.5 * h]);
		up.push(['L', 0, row * rowH + 0.5 * h]);

		for (let col = 0; col < columns; col++) {
			leftToRight.push(
				['L', col * colW + w, row * rowH + 1.5 * h],
				['L', col * colW + 2 * w, row * rowH + 0.5 * h]
			);

			rightToLeft.push(
				['L', (columns - 1 - col) * colW + w, row * rowH + 2.5 * h],
				['L', (columns - 1 - col) * colW + 0, row * rowH + 3.5 * h]
			);
			const insideStems: PathSegment[] =
				col < columns - 1
					? [
							['M', col * colW + colW, row * rowH + 0.5 * h],
							['L', col * colW + colW, row * rowH + 3.5 * h]
						]
					: [];

			stems.push(
				...insideStems,
				['M', col * colW + w, row * rowH],
				['L', col * colW + w, row * rowH + 1.5 * h],
				['M', col * colW + w, row * rowH + 2.5 * h],
				['L', col * colW + w, row * rowH + 4 * h]
			);
		}

		units.push(['M', 0, row * rowH + 0.5 * h], ...leftToRight, ...down, ...rightToLeft, ...up);
	}
	units.push(...stems);
	return units;
};
