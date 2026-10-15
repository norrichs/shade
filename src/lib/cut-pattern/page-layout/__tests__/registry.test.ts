import { buildNestGeom, buildPageGeom } from '../registry';
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
});
