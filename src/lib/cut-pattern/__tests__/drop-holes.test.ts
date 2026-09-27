import { describe, it, expect } from '@jest/globals';
import { dropHoles, mulberry32, postProcessBandPath, seedFor } from '../drop-holes';
import { defaultDropCurve, type PostProcessConfig } from '../hole-drop-config';
import type { BandHoleIndex } from '../hole-index';
import type { BezierConfig, PathSegment, PointConfig2 } from '$lib/types';

const pt = (x: number, y: number): PointConfig2 => ({ type: 'PointConfig2', x, y });

/** A path of `n + 1` five-segment contours: contour 0 is the outer shell. */
const pathWith = (n: number): PathSegment[] => {
	const out: PathSegment[] = [];
	for (let i = 0; i <= n; i += 1) {
		out.push(['M', i, 0], ['L', i + 1, 0], ['L', i + 1, 1], ['L', i, 1], ['Z']);
	}
	return out;
};

const indexFor = (n: number, seed = 1): BandHoleIndex => ({
	seed,
	holes: Array.from({ length: n }, (_, i) => ({
		start: (i + 1) * 5,
		end: (i + 2) * 5,
		bandFraction: n === 1 ? 0.5 : i / (n - 1),
		area: 1
	}))
});

const cfg = (dropHoles: PostProcessConfig['dropHoles'], runSeed = 0): PostProcessConfig => ({
	dropHoles,
	runSeed
});

describe('mulberry32', () => {
	it('is deterministic for a seed and produces values in [0, 1)', () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const runA = [a(), a(), a()];
		const runB = [b(), b(), b()];

		expect(runA).toEqual(runB);
		for (const v of runA) {
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it('produces different sequences for different seeds', () => {
		expect(mulberry32(1)()).not.toBeCloseTo(mulberry32(2)(), 9);
	});
});

describe('seedFor', () => {
	it('returns a stable 32-bit value that changes with either input', () => {
		expect(seedFor(123, 0)).toBe(seedFor(123, 0));
		expect(seedFor(123, 1)).not.toBe(seedFor(123, 0));
		expect(seedFor(124, 0)).not.toBe(seedFor(123, 0));
		expect(seedFor(123, 5)).toBeGreaterThanOrEqual(0);
		expect(seedFor(123, 5)).toBeLessThan(2 ** 32);
	});
});

describe('dropHoles', () => {
	it('returns the input untouched in none mode', () => {
		const path = pathWith(3);
		expect(dropHoles(path, indexFor(3), cfg({ mode: 'none' }))).toBe(path);
	});

	it('drops every hole in all mode, keeping the outer contour', () => {
		const result = dropHoles(pathWith(3), indexFor(3), cfg({ mode: 'all' }));

		expect(result).toHaveLength(5);
		expect(result[0]).toEqual(['M', 0, 0]);
	});

	it('is a no-op when the index has no holes', () => {
		const path = pathWith(0);
		expect(dropHoles(path, { seed: 1, holes: [] }, cfg({ mode: 'all' }))).toBe(path);
	});

	it('drops nothing at chance 0 and everything at chance 1', () => {
		expect(dropHoles(pathWith(4), indexFor(4), cfg({ mode: 'random', chance: 0 }))).toHaveLength(
			25
		);
		expect(dropHoles(pathWith(4), indexFor(4), cfg({ mode: 'random', chance: 1 }))).toHaveLength(5);
	});

	it('is reproducible: same seeds and config give the same result', () => {
		const a = dropHoles(pathWith(20), indexFor(20, 99), cfg({ mode: 'random', chance: 0.5 }, 3));
		const b = dropHoles(pathWith(20), indexFor(20, 99), cfg({ mode: 'random', chance: 0.5 }, 3));

		expect(a).toEqual(b);
	});

	it('varies with the band seed', () => {
		const a = dropHoles(pathWith(20), indexFor(20, 1), cfg({ mode: 'random', chance: 0.5 }));
		const b = dropHoles(pathWith(20), indexFor(20, 2), cfg({ mode: 'random', chance: 0.5 }));

		expect(a).not.toEqual(b);
	});

	it('rerolls with runSeed, without touching the index', () => {
		const index = indexFor(20, 7);
		const a = dropHoles(pathWith(20), index, cfg({ mode: 'random', chance: 0.5 }, 0));
		const b = dropHoles(pathWith(20), index, cfg({ mode: 'random', chance: 0.5 }, 1));

		expect(a).not.toEqual(b);
		expect(index.seed).toBe(7);
	});

	it('drops roughly the configured share over many holes', () => {
		const n = 400;
		const kept = dropHoles(pathWith(n), indexFor(n, 7), cfg({ mode: 'random', chance: 0.25 }));
		const keptHoles = kept.length / 5 - 1;

		expect(keptHoles / n).toBeGreaterThan(0.65);
		expect(keptHoles / n).toBeLessThan(0.85);
	});

	it('follows the curve in variable mode: never at y=0, always at y=1', () => {
		const ramp: BezierConfig[] = [
			{ type: 'BezierConfig', points: [pt(0, 0), pt(1 / 3, 0), pt(2 / 3, 1), pt(1, 1)] }
		];
		const n = 200;
		const result = dropHoles(pathWith(n), indexFor(n, 5), cfg({ mode: 'variable', curve: ramp }));
		const survivors = new Set<number>();
		for (const seg of result) if (seg[0] === 'M') survivors.add(seg[1] as number);

		// Holes are laid out with bandFraction rising with index, and contour i+1
		// starts at x = i + 1. The first few (chance ~0) all survive; the last few
		// (chance ~1) are all gone.
		expect(survivors.has(1)).toBe(true);
		expect(survivors.has(2)).toBe(true);
		expect(survivors.has(n)).toBe(false);
		expect(survivors.has(n - 1)).toBe(false);
	});

	it('drops about half with the flat default curve', () => {
		const n = 400;
		const result = dropHoles(
			pathWith(n),
			indexFor(n, 11),
			cfg({ mode: 'variable', curve: defaultDropCurve() })
		);
		const keptHoles = result.length / 5 - 1;

		expect(keptHoles / n).toBeGreaterThan(0.4);
		expect(keptHoles / n).toBeLessThan(0.6);
	});
});

describe('postProcessBandPath', () => {
	it('matches dropHoles when the outline is kept', () => {
		const config = cfg({ mode: 'random', chance: 0.5 }, 3);
		expect(postProcessBandPath(pathWith(6), indexFor(6), config)).toEqual(
			dropHoles(pathWith(6), indexFor(6), config)
		);
	});

	it('keeps only the holes when dropping the outline', () => {
		const result = postProcessBandPath(pathWith(3), indexFor(3), {
			...cfg({ mode: 'none' }),
			dropOutline: true
		});

		expect(result).toEqual(pathWith(3).slice(5));
	});

	it('keeps only the holes that survive hole dropping', () => {
		const n = 12;
		const config = cfg({ mode: 'random', chance: 0.5 }, 7);
		const holesDropped = dropHoles(pathWith(n), indexFor(n), config);
		const outlineDropped = postProcessBandPath(pathWith(n), indexFor(n), {
			...config,
			dropOutline: true
		});

		// Same surviving holes; only the outer contour differs.
		expect(outlineDropped).toEqual(holesDropped.slice(5));
	});

	it('leaves nothing when both outline and every hole are dropped', () => {
		const result = postProcessBandPath(pathWith(3), indexFor(3), {
			...cfg({ mode: 'all' }),
			dropOutline: true
		});

		expect(result).toEqual([]);
	});

	it('leaves nothing for a band with no holes', () => {
		const result = postProcessBandPath(
			pathWith(0),
			{ seed: 1, holes: [] },
			{
				...cfg({ mode: 'none' }),
				dropOutline: true
			}
		);

		expect(result).toEqual([]);
	});
});
