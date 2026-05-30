import { Vector3 } from 'three';

export const GAP_BETWEEN_BANDS = 20;
export const ROW_GAP = GAP_BETWEEN_BANDS;

export type WrapInput = { width: number; height: number; alignedYOffset: number };
export type WrapOpts = {
	gap?: number;
	rowGap?: number;
	lineWrap?: boolean;
	wrapWidth?: number;
};

export const computeWrappedOrigins = (bands: WrapInput[], opts: WrapOpts = {}): Vector3[] => {
	const gap = opts.gap ?? GAP_BETWEEN_BANDS;
	const rowGap = opts.rowGap ?? ROW_GAP;
	const lineWrap = opts.lineWrap ?? false;
	const wrapWidth = opts.wrapWidth ?? Infinity;

	let x = 0;
	let rowY = 0;
	let rowMaxHeight = 0;

	return bands.map(({ width, height, alignedYOffset }) => {
		if (lineWrap && x > 0 && x + width > wrapWidth) {
			rowY += rowMaxHeight + rowGap;
			x = 0;
			rowMaxHeight = 0;
		}
		const origin = new Vector3(x, rowY + alignedYOffset, 0);
		x += width + gap;
		rowMaxHeight = Math.max(rowMaxHeight, height);
		return origin;
	});
};
