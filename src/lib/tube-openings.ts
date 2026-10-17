import type { Vector3 } from 'three';
import type { Tube } from './projection-geometry/types';

/**
 * One open end of a tube, measured across its widest extent in X.
 *
 * `a` and `b` are the opening's ring nodes with the least and greatest x, so
 * `width` (= b.x - a.x) is the same kind of axis extent as the model-size X/Y/Z
 * rows, and the indicators sit on real nodes of the rim.
 */
export type TubeOpening = {
	id: string;
	tube: number;
	end: 'start' | 'end';
	a: Vector3;
	b: Vector3;
	width: number;
};

/** Below this the ring is a collapsed pole, not an opening. */
const MIN_OPENING_WIDTH = 1e-6;

const measureRing = (points: Vector3[]): Pick<TubeOpening, 'a' | 'b' | 'width'> | null => {
	if (points.length < 2) return null;
	let a = points[0];
	let b = points[0];
	for (const point of points) {
		if (point.x < a.x) a = point;
		if (point.x > b.x) b = point;
	}
	const width = b.x - a.x;
	return width > MIN_OPENING_WIDTH ? { a, b, width } : null;
};

/**
 * The two openings of each tube: its first and last sections. For a globule tube
 * the sections are the levels, so these are the rims at the bottom and top of the
 * sweep. An end that closes to a pole has no opening and is left out.
 */
export const computeTubeOpenings = (tubes: Tube[]): TubeOpening[] =>
	tubes.flatMap((tube, tubeIndex) => {
		const { sections } = tube;
		if (sections.length < 2) return [];
		const ends: ['start' | 'end', Vector3[]][] = [
			['start', sections[0].points],
			['end', sections[sections.length - 1].points]
		];
		return ends.flatMap(([end, points]) => {
			const ring = measureRing(points);
			return ring ? [{ id: `opening-${tubeIndex}-${end}`, tube: tubeIndex, end, ...ring }] : [];
		});
	});
