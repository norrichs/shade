import { computeVertices } from '../segment-vertices';
import type { UnitDefinition } from '$lib/patterns/spec-types';

const makeUnit = (overrides: Partial<UnitDefinition> = {}): UnitDefinition => ({
	width: 42,
	height: 14,
	start: [],
	middle: [],
	end: [],
	...overrides
});

describe('computeVertices', () => {
	it('returns one vertex per unique (x, y) coordinate', () => {
		const unit = makeUnit({
			start: [
				['M', 0, 0],
				['L', 10, 2],
				['M', 10, 2],
				['L', 14, 0]
			]
		});
		const vertices = computeVertices(unit);
		expect(vertices).toHaveLength(3);
		expect(vertices[0]).toEqual({
			x: 0,
			y: 0,
			refs: [{ group: 'start', index: 0 }]
		});
		expect(vertices[1]).toEqual({
			x: 10,
			y: 2,
			refs: [
				{ group: 'start', index: 1 },
				{ group: 'start', index: 2 }
			]
		});
		expect(vertices[2]).toEqual({
			x: 14,
			y: 0,
			refs: [{ group: 'start', index: 3 }]
		});
	});

	it('groups coincident segments across start / middle / end', () => {
		const unit = makeUnit({
			start: [['M', 0, 0]],
			middle: [['L', 0, 0]],
			end: [['M', 0, 0]]
		});
		const vertices = computeVertices(unit);
		expect(vertices).toHaveLength(1);
		expect(vertices[0].refs).toEqual([
			{ group: 'start', index: 0 },
			{ group: 'middle', index: 0 },
			{ group: 'end', index: 0 }
		]);
	});

	it('treats Z and arc/bezier segments as ignored (not editable in v1)', () => {
		const unit = makeUnit({
			start: [['M', 0, 0], ['Z']],
			middle: [['C', 1, 1, 2, 2, 3, 3]]
		});
		const vertices = computeVertices(unit);
		expect(vertices).toHaveLength(1);
		expect(vertices[0]).toEqual({
			x: 0,
			y: 0,
			refs: [{ group: 'start', index: 0 }]
		});
	});

	it('handles an empty unit', () => {
		const vertices = computeVertices(makeUnit());
		expect(vertices).toHaveLength(0);
	});
});
