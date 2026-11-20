import { hideSplitSections, listSplitSections } from '../split-sections';
import type { TubeCutPattern } from '#lib/types.js';

// Tube 0 split at quads 10 and 20 (band 1 too short for the second cut);
// tube 1 unsplit.
const piece = (tube: number, band: number, piece: number, offset: number) => ({
	address: { globule: 0, tube, band, piece },
	parentQuadOffset: offset
});
const tubes = () =>
	[
		{
			projectionType: 'patterned',
			address: { globule: 0, tube: 0 },
			bands: [
				piece(0, 0, 0, 0),
				piece(0, 0, 1, 10),
				piece(0, 0, 2, 20),
				piece(0, 1, 0, 0),
				piece(0, 1, 1, 10)
			]
		},
		{
			projectionType: 'patterned',
			address: { globule: 0, tube: 1 },
			bands: [{ address: { globule: 0, tube: 1, band: 0 } }]
		}
	] as unknown as TubeCutPattern[];

describe('split sections', () => {
	it('lists the sections of split tubes from the generated pieces', () => {
		expect(
			listSplitSections(tubes()).map((s) => [s.key, s.index, s.startQuad, s.endQuad, s.bandCount])
		).toEqual([
			['0:0@0', 0, 0, 9, 2],
			['0:0@10', 1, 10, 19, 2],
			['0:0@20', 2, 20, undefined, 1]
		]);
	});

	it('hides the pieces of hidden sections only, and is identity when none are hidden', () => {
		const t = tubes();
		expect(hideSplitSections(t, [])).toBe(t);
		const shown = hideSplitSections(t, ['0:0@10']);
		expect(shown[0].bands.map((b) => b.parentQuadOffset)).toEqual([0, 20, 0]);
		expect(shown[1]).toBe(t[1]);
		expect(hideSplitSections(t, ['0:0@0', '0:0@10', '0:0@20'])).toEqual([t[1]]);
	});
});
