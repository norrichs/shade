import type { Tube } from '$lib/projection-geometry/types';
import { writable } from 'svelte/store';
import { Triangle, Vector3 } from 'three';

type Triplet = [number, number, number];

const initTriangle = ([a, b, c]: [Triplet, Triplet, Triplet]) =>
	new Triangle(new Vector3(...a), new Vector3(...b), new Vector3(...c));

const overrideTubes: Tube[] = [
	{
		bands: [
			{
				facets: [
					{
						triangle: initTriangle([
							[0, 0, 0],
							[100, 0, 0],
							[0, 100, 0]
						])
					},
					{
						triangle: initTriangle([
							[100, 100, 0],
							[0, 100, 0],
							[100, 0, 0]
						])
					},
					{
						triangle: initTriangle([
							[0, 100, 0],
							[100, 100, 0],
							[0, 200, 0]
						])
					},
					{
						triangle: initTriangle([
							[100, 200, 0],
							[0, 200, 0],
							[100, 100, 0]
						])
					}
				],
				orientation: 0
			}
		],
		sections: [],
		orientation: 0,
		address: { projection: 0, tube: 0 }
	}
];

export const overrideStore = writable({
	shouldUseOverride: false,
	projection: {
		tubes: overrideTubes
	}
});
