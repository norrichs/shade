import { describe, it, expect } from '@jest/globals';
import { clampAssemblerPanels, DEFAULT_ASSEMBLER_PANELS } from '../uiStores';

describe('clampAssemblerPanels', () => {
	it('defaults are 2/5 · 1/5 · 2/5 with the top row at 0.7', () => {
		expect(DEFAULT_ASSEMBLER_PANELS).toEqual({ left: 0.4, right: 0.6, top: 0.7 });
		expect(clampAssemblerPanels(DEFAULT_ASSEMBLER_PANELS, 'left')).toEqual(DEFAULT_ASSEMBLER_PANELS);
	});

	it('left divider stops 0.1 short of the right one', () => {
		expect(clampAssemblerPanels({ left: 0.58, right: 0.6, top: 0.7 }, 'left').left).toBeCloseTo(0.5);
	});

	it('left divider keeps the model pane at least 0.1', () => {
		expect(clampAssemblerPanels({ left: 0.02, right: 0.6, top: 0.7 }, 'left').left).toBeCloseTo(0.1);
	});

	it('right divider stops 0.1 past the left one', () => {
		expect(clampAssemblerPanels({ left: 0.4, right: 0.42, top: 0.7 }, 'right').right).toBeCloseTo(0.5);
	});

	it('right divider keeps the pattern pane at least 0.1', () => {
		expect(clampAssemblerPanels({ left: 0.4, right: 0.97, top: 0.7 }, 'right').right).toBeCloseTo(0.9);
	});

	it('the unmoved divider stays put', () => {
		const p = clampAssemblerPanels({ left: 0.58, right: 0.6, top: 0.7 }, 'left');
		expect(p.right).toBe(0.6);
		expect(p.top).toBe(0.7);
	});

	it('top split is clamped to [0.15, 0.9]', () => {
		expect(clampAssemblerPanels({ left: 0.4, right: 0.6, top: 0.05 }, 'top').top).toBeCloseTo(0.15);
		expect(clampAssemblerPanels({ left: 0.4, right: 0.6, top: 0.99 }, 'top').top).toBeCloseTo(0.9);
	});

	it('repairs a stored layout that violates the minimums', () => {
		const p = clampAssemblerPanels({ left: 0.85, right: 0.5, top: 2 }, 'top');
		expect(p.left).toBeGreaterThanOrEqual(0.1);
		expect(p.right - p.left).toBeGreaterThanOrEqual(0.1 - 1e-9);
		expect(p.right).toBeLessThanOrEqual(0.9 + 1e-9);
		expect(p.top).toBeCloseTo(0.9);
	});
});
