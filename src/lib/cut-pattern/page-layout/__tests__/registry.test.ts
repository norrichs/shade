import { buildNestGeom, buildPageGeom, nestAllowsQuarterTurn } from '../registry';
import { NEST_CELL_MM } from '../nest/nest';
import { defaultPatternConfig } from '$lib/shades-config';

describe('buildNestGeom', () => {
	it('extends the page geom with rotationStep and cellMm', () => {
		const cfg = {
			...defaultPatternConfig().pageLayout,
			algorithm: 'nest' as const,
			rotationStep: 30
		};
		const g = buildNestGeom(cfg);
		expect(g).toMatchObject(buildPageGeom(cfg));
		expect(g.rotationStep).toBe(30);
		expect(g.cellMm).toBe(NEST_CELL_MM);
	});
	it('default config has rotationStep 15', () => {
		expect(defaultPatternConfig().pageLayout.rotationStep).toBe(15);
	});
	it.each([
		[-15, 0],
		[null, 15],
		[400, 180],
		[Number.NaN, 15],
		[45, 45],
		[0, 0],
		[0.001, 1],
		[0.5, 1],
		[1, 1],
		[Infinity, 15]
	])('clamps rotationStep %p to %p', (input, expected) => {
		const cfg = {
			...defaultPatternConfig().pageLayout,
			algorithm: 'nest' as const,
			rotationStep: input as unknown as number
		};
		expect(buildNestGeom(cfg).rotationStep).toBe(expected);
	});
});

describe('nestAllowsQuarterTurn', () => {
	it('is true only for a positive step that divides 90', () => {
		expect(nestAllowsQuarterTurn(15)).toBe(true);
		expect(nestAllowsQuarterTurn(90)).toBe(true);
		expect(nestAllowsQuarterTurn(0)).toBe(false);
		expect(nestAllowsQuarterTurn(40)).toBe(false);
		expect(nestAllowsQuarterTurn(180)).toBe(false);
	});
});
