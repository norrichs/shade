import { describe, it, expect } from '@jest/globals';
import { exportFrame } from '../export-frame';

describe('exportFrame', () => {
	it('makes a 300 mm page exactly 300mm with mm user units', () => {
		const f = exportFrame([{ x: 0, y: 0, width: 600, height: 600 }], 2);
		expect(f.width).toBe('300mm');
		expect(f.height).toBe('300mm');
		expect(f.viewBox).toBe('0 0 300 300');
		expect(f.contentTransform).toBe('scale(0.5) translate(0 0)');
	});
	it('spans every page from their union origin', () => {
		const f = exportFrame(
			[{ x: 100, y: 50, width: 600, height: 600 }, { x: 100, y: 670, width: 600, height: 600 }],
			2
		);
		expect(f.heightMm).toBe(610);
		expect(f.contentTransform).toBe('scale(0.5) translate(-100 -50)');
	});
	it('refuses no pages or a bad scale', () => {
		expect(() => exportFrame([], 2)).toThrow();
		expect(() => exportFrame([{ x: 0, y: 0, width: 1, height: 1 }], 0)).toThrow();
	});
});
