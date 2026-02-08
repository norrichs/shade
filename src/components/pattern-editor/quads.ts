import type { Quadrilateral } from '$lib/types';
import { Vector3 } from 'three';

export const quadBands = (w: number, h: number): Quadrilateral[][] => [
	[
		{
			b: new Vector3(0 * w, 0 * h, 0),
			a: new Vector3(-1 * w, 0 * h, 0),
			d: new Vector3(-1.4 * w, 1 * h, 0),
			c: new Vector3(0.2 * w, 1 * h, 0)
		},
		{
			a: new Vector3(-1.4 * w, 1 * h, 0),
			b: new Vector3(0.2 * w, 1 * h, 0),
			c: new Vector3(0 * w, 2 * h, 0),
			d: new Vector3(-1.0 * w, 2 * h, 0)
		},
		{
			b: new Vector3(0 * w, 2 * h, 0),
			a: new Vector3(-1.0 * w, 2 * h, 0),
			d: new Vector3(-1 * w, 2.75 * h, 0),
			c: new Vector3(-0.3 * w, 3 * h, 0)
		}
	],
	[
		{
			a: new Vector3(0 * w, 0 * h, 0),
			b: new Vector3(1 * w, 0 * h, 0),
			c: new Vector3(1.2 * w, 1 * h, 0),
			d: new Vector3(-0.2 * w, 1 * h, 0)
		},
		{
			a: new Vector3(-0.2 * w, 1 * h, 0),
			b: new Vector3(1.2 * w, 1 * h, 0),
			c: new Vector3(1.1 * w, 2 * h, 0),
			d: new Vector3(0 * w, 2 * h, 0)
		},
		{
			a: new Vector3(0 * w, 2 * h, 0),
			b: new Vector3(1.1 * w, 2 * h, 0),
			c: new Vector3(1 * w, 2.75 * h, 0),
			d: new Vector3(0.3 * w, 3 * h, 0)
		}
	],
	[
		{
			b: new Vector3(0 * w, 0 * h, 0),
			a: new Vector3(-1 * w, 0 * h, 0),
			d: new Vector3(-1.2 * w, 1 * h, 0),
			c: new Vector3(0.2 * w, 1 * h, 0)
		},
		{
			b: new Vector3(0.2 * w, 1 * h, 0),
			a: new Vector3(-1.2 * w, 1 * h, 0),
			d: new Vector3(-1.1 * w, 2 * h, 0),
			c: new Vector3(0 * w, 2 * h, 0)
		},
		{
			b: new Vector3(0 * w, 2 * h, 0),
			a: new Vector3(-1.1 * w, 2 * h, 0),
			d: new Vector3(-1 * w, 2.75 * h, 0),
			c: new Vector3(-0.3 * w, 3 * h, 0)
		}
	]
];
