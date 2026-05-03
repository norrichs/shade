import { ghostTransform } from '../tile-editor/editor-mode';

describe('ghostTransform', () => {
	const unit = { width: 42, height: 14, start: [], middle: [], end: [] };

	it('translates +unit.height for withinBand (next facet along band axis)', () => {
		expect(ghostTransform('withinBand', unit, { x: 10, y: 2 })).toEqual({ x: 10, y: 16 });
	});

	it('translates -unit.width for acrossBands (prev band, prev.b → current.a)', () => {
		expect(ghostTransform('acrossBands', unit, { x: 10, y: 2 })).toEqual({ x: -32, y: 2 });
	});

	it('mirrors across y=0 for partnerStart', () => {
		expect(ghostTransform('partnerStart', unit, { x: 10, y: 2 })).toEqual({ x: 10, y: -2 });
	});

	it('mirrors across y=unit.height for partnerEnd', () => {
		expect(ghostTransform('partnerEnd', unit, { x: 10, y: 2 })).toEqual({ x: 10, y: 26 });
	});
});
