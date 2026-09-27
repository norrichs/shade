import { describe, it, expect } from '@jest/globals';
import { insertGaps, applyConnectSurround } from '../outline-gap';
import { flattenPath } from '../path-contours';
import type { TaggedPath } from '../post-process-types';
import type { PathSegment } from '$lib/types';

const length = (segs: PathSegment[]) =>
	flattenPath(segs).reduce(
		(n, run) => n + run.slice(1).reduce((m, p, i) => m + Math.hypot(p.x - run[i].x, p.y - run[i].y), 0),
		0
	);
const outline = (segments: PathSegment[]): TaggedPath => ({ geometry: 'pattern-outline', segments, contour: 0 });
const square: PathSegment[] = [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']];
const K = 0.5522847498 * 10;
const circle: PathSegment[] = [
	['M', 10, 0],
	['C', 10, K, K, 10, 0, 10],
	['C', -K, 10, -10, K, -10, 0],
	['C', -10, -K, -K, -10, 0, -10],
	['C', K, -10, 10, -K, 10, 0],
	['Z']
];

describe('insertGaps', () => {
	it('cuts one gap per point out of a line contour', () => {
		const out = insertGaps(outline(square), [{ x: 5, y: 0 }, { x: 5, y: 10 }], 2);
		const gaps = out.filter((p) => p.geometry === 'outline-gap');
		const rest = out.filter((p) => p.geometry === 'pattern-outline');
		expect(gaps).toHaveLength(2);
		expect(rest).toHaveLength(1);
		gaps.forEach((g) => expect(length(g.segments)).toBeCloseTo(2, 6));
		expect(length(rest[0].segments)).toBeCloseTo(36, 6);
		expect(rest[0].contour).toBe(0);
	});

	it('cuts gaps out of a cubic contour within tolerance', () => {
		const total = length(circle);
		const out = insertGaps(outline(circle), [{ x: 0, y: -10 }, { x: 0, y: 10 }], 2);
		out.filter((p) => p.geometry === 'outline-gap').forEach((g) => expect(length(g.segments)).toBeCloseTo(2, 1));
		// both sides are 8-sample flattenings of differently split curves; compare to within 0.5
		expect(length(out.find((p) => p.geometry === 'pattern-outline')!.segments)).toBeCloseTo(total - 4, 0);
	});

	it('handles a window that wraps the contour start', () => {
		const out = insertGaps(outline(square), [{ x: 0, y: 0 }], 2);
		const gap = out.find((p) => p.geometry === 'outline-gap')!;
		expect(gap.segments.filter((s) => s[0] === 'M')).toHaveLength(1);
		expect(length(gap.segments)).toBeCloseTo(2, 6);
		expect(length(out.find((p) => p.geometry === 'pattern-outline')!.segments)).toBeCloseTo(38, 6);
	});

	it('merges overlapping windows', () => {
		const gaps = insertGaps(outline(square), [{ x: 4, y: 0 }, { x: 5, y: 0 }], 2).filter(
			(p) => p.geometry === 'outline-gap'
		);
		expect(gaps).toHaveLength(1);
		expect(length(gaps[0].segments)).toBeCloseTo(3, 6);
	});

	it('leaves the piece alone when the gap is at least half the contour', () => {
		expect(insertGaps(outline(square), [{ x: 5, y: 0 }], 20)).toEqual([outline(square)]);
	});
});

describe('applyConnectSurround', () => {
	it('splits the outline piece nearest each end and passes holes through', () => {
		const hole: TaggedPath = {
			geometry: 'pattern-hole',
			segments: [['M', 4, 4], ['L', 6, 4], ['L', 6, 6], ['Z']],
			contour: 1
		};
		const out = applyConnectSurround(
			[outline(square), hole],
			{
				start: { point: { x: 5, y: 0 }, outward: { x: 0, y: -1 } },
				end: { point: { x: 5, y: 10 }, outward: { x: 0, y: 1 } }
			},
			2
		);
		expect(out.filter((p) => p.geometry === 'outline-gap')).toHaveLength(2);
		expect(out).toContainEqual(hole);
	});
});
