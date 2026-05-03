import { ghostTransform } from '../tile-editor/editor-mode';

describe('ghostTransform', () => {
	const unit = { width: 42, height: 14, start: [], middle: [], end: [] };

	it('translates +unit.height for withinBand (next facet along band axis)', () => {
		expect(ghostTransform('withinBand', unit, { x: 10, y: 2 })).toEqual({ x: 10, y: 16 });
	});

	it('translates -unit.width for acrossBands (prev band, prev.b → current.a)', () => {
		expect(ghostTransform('acrossBands', unit, { x: 10, y: 2 })).toEqual({ x: -32, y: 2 });
	});

	it('rotates 180° around (unit.width/2, 0) for partnerStart', () => {
		expect(ghostTransform('partnerStart', unit, { x: 10, y: 2 })).toEqual({ x: 32, y: -2 });
	});

	it('rotates 180° around (unit.width/2, unit.height) for partnerEnd', () => {
		expect(ghostTransform('partnerEnd', unit, { x: 10, y: 2 })).toEqual({ x: 32, y: 26 });
	});
});
