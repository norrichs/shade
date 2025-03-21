import type { Quadrilateral } from '$lib/types';

export const quadBands = (w: number, h: number): Quadrilateral[][] => [
	[
		{
			p1: { x: 0 * w, y: 0 * h },
			p0: { x: -1 * w, y: 0 * h },
			p3: { x: -1.4 * w, y: 1 * h },
			p2: { x: 0.2 * w, y: 1 * h }
		},
		{
			p0: { x: -1.4 * w, y: 1 * h },
			p1: { x: 0.2 * w, y: 1 * h },
			p2: { x: 0 * w, y: 2 * h },
			p3: { x: -1.0 * w, y: 2 * h },
		},
		{
			p1: { x: 0 * w, y: 2 * h },
			p0: { x: -1.0 * w, y: 2 * h },
			p3: { x: -1 * w, y: 2.75 * h },
			p2: { x: -0.3 * w, y: 3 * h }
		}
	],
	[
		{
			p0: { x: 0 * w, y: 0 * h },
			p1: { x: 1 * w, y: 0 * h },
			p2: { x: 1.2 * w, y: 1 * h },
			p3: { x: -0.2 * w, y: 1 * h }
		},
		{
			p0: { x: -0.2 * w, y: 1 * h },
			p1: { x: 1.2 * w, y: 1 * h },
			p2: { x: 1.1 * w, y: 2 * h },
			p3: { x: 0 * w, y: 2 * h }
		},
		{
			p0: { x: 0 * w, y: 2 * h },
			p1: { x: 1.1 * w, y: 2 * h },
			p2: { x: 1 * w, y: 2.75 * h },
			p3: { x: 0.3 * w, y: 3 * h }
		}
	],
	[
		{
			p1: { x: 0 * w, y: 0 * h },
			p0: { x: -1 * w, y: 0 * h },
			p3: { x: -1.2 * w, y: 1 * h },
			p2: { x: 0.2 * w, y: 1 * h }
		},
		{
			p1: { x: 0.2 * w, y: 1 * h },
			p0: { x: -1.2 * w, y: 1 * h },
			p3: { x: -1.1 * w, y: 2 * h },
			p2: { x: 0 * w, y: 2 * h }
		},
		{
			p1: { x: 0 * w, y: 2 * h },
			p0: { x: -1.1 * w, y: 2 * h },
			p3: { x: -1 * w, y: 2.75 * h },
			p2: { x: -0.3 * w, y: 3 * h }
		}
	],
];
