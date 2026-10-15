import { buildNestShape } from '../nest-shape';
import type { BandCutPattern } from '$lib/types';
import type { EffectiveBoundsContext } from '$lib/cut-pattern/band-layout';

const quadFacet = (x: number, y: number, s: number, strokeWidth = 0) => ({
	path: [['M', x, y], ['L', x + s, y], ['L', x + s, y + s], ['L', x, y + s], ['Z']],
	label: '',
	strokeWidth
});

const band = (facets: unknown[], extra: Partial<BandCutPattern> = {}) =>
	({
		id: 'b',
		facets,
		address: { globule: 0, tube: 0, band: 0 },
		projectionType: 'patterned',
		tagAnchorPoint: undefined,
		...extra
	}) as unknown as BandCutPattern;

const ctx: EffectiveBoundsContext = {
	labels: undefined,
	externalTagEnabled: false,
	measuredDims: new Map(),
	groupCodeFor: () => undefined
};

describe('buildNestShape', () => {
	it('one convex polygon per facet, carrying the pivot', () => {
		const s = buildNestShape(band([quadFacet(0, 0, 10), quadFacet(10, 0, 10)]), ctx, {
			x: 10,
			y: 5
		});
		expect(s.polygons).toHaveLength(2);
		expect(s.pivot).toEqual({ x: 10, y: 5 });
	});
	it('inflates by half the stroke width', () => {
		const s = buildNestShape(band([quadFacet(0, 0, 10, 4)]), ctx, { x: 0, y: 0 });
		expect(Math.min(...s.polygons[0].map((p) => p.x))).toBeCloseTo(-2);
	});
	it('skips facets with empty or non-finite paths', () => {
		const s = buildNestShape(
			band([
				quadFacet(0, 0, 10),
				{ path: [], label: '' },
				{
					path: [
						['M', NaN, NaN],
						['L', NaN, 0]
					],
					label: ''
				}
			]),
			ctx,
			{ x: 0, y: 0 }
		);
		expect(s.polygons).toHaveLength(1);
		expect(s.polygons.flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
	});
	it('adds the self-tag footprint as a polygon when the tag is shown', () => {
		const labelled = { ...ctx, labels: { selfTag: { enabled: true } } as never };
		const s = buildNestShape(
			band([quadFacet(0, 0, 10)], { tagAnchorPoint: { x: 5, y: 10 } }),
			labelled,
			{ x: 0, y: 0 }
		);
		expect(s.polygons).toHaveLength(2);
	});
});
