import type { Point } from './Point';

export type Intersection = {
	subSegmentIndex: number;
	point?: Point | undefined;
	t?: number | undefined;
};
