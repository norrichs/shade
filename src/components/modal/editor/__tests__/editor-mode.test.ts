import { ghostTransform } from '../tile-editor/editor-mode';

describe('ghostTransform', () => {
	const unit = { width: 42, height: 14, start: [], middle: [], end: [] };

	it('translates +unit.width for withinBand', () => {
		expect(ghostTransform('withinBand', unit, { x: 10, y: 2 })).toEqual({ x: 52, y: 2 });
	});

	it('translates -unit.height for acrossBands', () => {
		expect(ghostTransform('acrossBands', unit, { x: 10, y: 2 })).toEqual({ x: 10, y: -12 });
	});

	it('mirrors across x=0 for partnerStart', () => {
		expect(ghostTransform('partnerStart', unit, { x: 10, y: 2 })).toEqual({ x: -10, y: 2 });
	});

	it('mirrors across x=unit.width for partnerEnd', () => {
		expect(ghostTransform('partnerEnd', unit, { x: 10, y: 2 })).toEqual({ x: 74, y: 2 });
	});
});
