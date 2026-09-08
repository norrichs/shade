import { Vector3 } from 'three';
import { outlinePolygonFromEdges } from '../generate-outlined-pattern';

describe('outlinePolygonFromEdges', () => {
	it('takes the start point of each edge, dropping z', () => {
		const edges = [
			{ start: new Vector3(0, 0, 0) },
			{ start: new Vector3(10, 0, 0) },
			{ start: new Vector3(10, 10, 0) }
		];
		expect(outlinePolygonFromEdges(edges)).toEqual([
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 }
		]);
	});

	it('drops the collapsed edges a globule pole facet produces', () => {
		const edges = [
			{ start: new Vector3(0, 0, 0) },
			{ start: new Vector3(0, 0, 0) },
			{ start: new Vector3(10, 0, 0) },
			{ start: new Vector3(10, 10, 0) }
		];
		expect(outlinePolygonFromEdges(edges)).toHaveLength(3);
	});

	it('handles an empty edge list', () => {
		expect(outlinePolygonFromEdges([])).toEqual([]);
	});
});
