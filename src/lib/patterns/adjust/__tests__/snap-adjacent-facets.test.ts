import { Vector3 } from 'three';
import type { PathSegment, Quadrilateral } from '$lib/types';
import { snapAdjacentFacets, type FacetSnapRule } from '../snap-adjacent-facets';

const quads = (count: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(0, i, 0),
		b: new Vector3(1, i, 0),
		c: new Vector3(1, i + 1, 0),
		d: new Vector3(0, i + 1, 0)
	}));

// Facet i is a two-node path at x = 10i.
const band = (count: number): PathSegment[][] =>
	Array.from({ length: count }, (_, i) => [
		['M', 10 * i, 0],
		['L', 10 * i + 1, 0]
	]);

const always = (rules: FacetSnapRule[]) => () => rules;

describe('snapAdjacentFacets', () => {
	it('copies a node from the previous facet, keeping the target command', () => {
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			always([{ from: 'prev', pairs: [{ target: 0, source: 1 }] }]),
			{ endsMatched: false }
		);
		expect(result[1][0]).toEqual(['M', 1, 0]);
		expect(result[2][0]).toEqual(['M', 11, 0]);
	});

	it('copies a node from the next facet', () => {
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			always([{ from: 'next', pairs: [{ target: 1, source: 0 }] }]),
			{ endsMatched: false }
		);
		expect(result[0][1]).toEqual(['L', 10, 0]);
		expect(result[1][1]).toEqual(['L', 20, 0]);
	});

	it('copies a node from the same facet', () => {
		const result = snapAdjacentFacets(
			band(2),
			quads(2),
			always([{ from: 'self', pairs: [{ target: 0, source: 1 }] }]),
			{ endsMatched: false }
		);
		expect(result[0][0]).toEqual(['M', 1, 0]);
		expect(result[1][0]).toEqual(['M', 11, 0]);
	});

	it('reads sources from the unmodified input', () => {
		// Facet 2 reads facet 1 node 1, which is never a target, and facet 1 node 0,
		// which IS a target. The snapped value must not leak into facet 2.
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			always([{ from: 'prev', pairs: [{ target: 0, source: 0 }] }]),
			{ endsMatched: false }
		);
		expect(result[2][0]).toEqual(['M', 10, 0]);
	});

	it('leaves the band ends alone when ends are not matched', () => {
		const input = band(3);
		const result = snapAdjacentFacets(
			input,
			quads(3),
			always([
				{ from: 'prev', pairs: [{ target: 0, source: 1 }] },
				{ from: 'next', pairs: [{ target: 1, source: 0 }] }
			]),
			{ endsMatched: false }
		);
		expect(result[0][0]).toEqual(['M', 0, 0]);
		expect(result[2][1]).toEqual(['L', 21, 0]);
	});

	it('wraps the ends through a translated clone when ends are matched', () => {
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			always([
				{ from: 'prev', pairs: [{ target: 0, source: 1 }] },
				{ from: 'next', pairs: [{ target: 1, source: 0 }] }
			]),
			{ endsMatched: true }
		);
		// prev of facet 0 = facet 2 translated by quad0.a − quad2.d = (0, −3)
		expect(result[0][0][1]).toBeCloseTo(21);
		expect(result[0][0][2]).toBeCloseTo(-3);
		// next of facet 2 = facet 0 translated by quad2.d − quad0.a = (0, 3)
		expect(result[2][1][1]).toBeCloseTo(0);
		expect(result[2][1][2]).toBeCloseTo(3);
	});

	it('never wraps next on a single-facet band', () => {
		const result = snapAdjacentFacets(
			band(1),
			quads(1),
			always([{ from: 'next', pairs: [{ target: 1, source: 0 }] }]),
			{ endsMatched: true }
		);
		expect(result[0][1]).toEqual(['L', 1, 0]);
	});

	it('supplies rules per facet index', () => {
		const result = snapAdjacentFacets(
			band(3),
			quads(3),
			(i) => (i === 1 ? [{ from: 'self', pairs: [{ target: 0, source: 1 }] }] : []),
			{ endsMatched: false }
		);
		expect(result[0][0]).toEqual(['M', 0, 0]);
		expect(result[1][0]).toEqual(['M', 11, 0]);
		expect(result[2][0]).toEqual(['M', 20, 0]);
	});

	it('does not mutate its input', () => {
		const input = band(3);
		const copy = structuredClone(input);
		snapAdjacentFacets(
			input,
			quads(3),
			always([{ from: 'self', pairs: [{ target: 0, source: 1 }] }]),
			{
				endsMatched: true
			}
		);
		expect(input).toEqual(copy);
	});
});
