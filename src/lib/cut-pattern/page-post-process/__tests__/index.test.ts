import { describe, it, expect } from '@jest/globals';
import { pagePostProcess } from '../index';
import type { PlacedBand } from '../../post-process-types';
import { DEFAULT_POST_PROCESS } from '../../hole-drop-config';

const rectPoly = (x0: number, y0: number, x1: number, y1: number) => [
	{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }
];
const band: PlacedBand = {
	bandId: 'a',
	page: 0,
	outlines: [rectPoly(45, 10, 55, 80)],
	holes: [],
	ends: {
		start: { point: { x: 50, y: 10 }, outward: { x: 0, y: -1 } },
		end: { point: { x: 50, y: 80 }, outward: { x: 0, y: 1 } }
	}
};
const base = {
	bands: [band],
	pages: [{ x: 0, y: 0, width: 100, height: 100 }],
	pageScale: 1,
	marginPx: 5,
	gap: 2,
	configName: 'shade',
	dict: { '1': { path: [['M', 0, 0], ['L', 1, 1]], width: 1 } } as never
};

describe('pagePostProcess', () => {
	it('does nothing with everything off', () => {
		expect(pagePostProcess({ ...base, config: DEFAULT_POST_PROCESS })).toEqual({ disconnects: [], pageLabels: [] });
	});
	it('emits disconnects when enabled', () => {
		const r = pagePostProcess({ ...base, config: { ...DEFAULT_POST_PROCESS, disconnectSurround: true } });
		expect(r.disconnects).toHaveLength(2);
	});
	it('skips labels without a font dictionary', () => {
		const r = pagePostProcess({
			...base,
			dict: undefined,
			config: { ...DEFAULT_POST_PROCESS, pageLabel: { pageNumber: true, configName: false, text: '' } }
		});
		expect(r.pageLabels).toEqual([]);
	});
});
