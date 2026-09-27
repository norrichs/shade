import { describe, it, expect } from '@jest/globals';
import { toBandMergePayloads } from '../band-merge-payload';
import { buildContourIndex, holesOf } from '../contour-index';
import { dropHoles } from '../drop-holes';
import { computeMergedBandPaths } from '../prepare-merge';
import {
	buildDefaultGeometry,
	generateProjectionTubes,
	splitAllTubesAt
} from './helpers/real-geometry';
import { tiledPatternConfigs } from '$lib/shades-config';

const tiledConfig = tiledPatternConfigs['tiledHexPattern-1'];

describe('hole dropping over real geometry', () => {
	const geometry = buildDefaultGeometry();
	// Split so the parent-span arithmetic is exercised on real bands too.
	const tubes = generateProjectionTubes(geometry, tiledConfig, splitAllTubesAt(geometry, [2]), 1);
	const merged = computeMergedBandPaths(tubes, undefined, tiledConfig.type, new Map(), 0);
	const payloads = toBandMergePayloads(tubes, new Map());

	it('leaves the merged output identical in none mode', () => {
		for (const payload of payloads) {
			const path = merged.get(payload.id);
			if (!path) continue;
			const index = buildContourIndex(path, payload, tiledConfig.type);
			expect(dropHoles(path, index, { dropHoles: { mode: 'none' }, runSeed: 0 })).toBe(path);
		}
	});

	it('finds holes in a real tiled band and keeps their fractions in range', () => {
		let totalHoles = 0;
		for (const payload of payloads) {
			const path = merged.get(payload.id);
			if (!path) continue;
			const index = buildContourIndex(path, payload, tiledConfig.type);
			const holes = holesOf(index);
			totalHoles += holes.length;
			for (const hole of holes) {
				expect(hole.bandFraction).toBeGreaterThanOrEqual(-1e-9);
				expect(hole.bandFraction).toBeLessThanOrEqual(1 + 1e-9);
				expect(path[hole.start][0]).toBe('M');
			}
		}
		expect(totalHoles).toBeGreaterThan(0);
	});

	it('keeps each piece’s holes inside that piece’s span of the parent', () => {
		for (const payload of payloads) {
			const path = merged.get(payload.id);
			if (!path) continue;
			for (const hole of holesOf(buildContourIndex(path, payload, tiledConfig.type))) {
				expect(hole.bandFraction).toBeGreaterThanOrEqual(payload.pieceStartFraction - 1e-9);
				expect(hole.bandFraction).toBeLessThanOrEqual(payload.pieceEndFraction + 1e-9);
			}
		}
	});

	it('produces a strictly shorter path in all mode, and only by whole contours', () => {
		for (const payload of payloads) {
			const path = merged.get(payload.id);
			if (!path) continue;
			const index = buildContourIndex(path, payload, tiledConfig.type);
			const holes = holesOf(index);
			if (holes.length === 0) continue;
			const dropped = dropHoles(path, index, { dropHoles: { mode: 'all' }, runSeed: 0 });
			const removed = path.length - dropped.length;

			expect(removed).toBe(holes.reduce((sum, h) => sum + (h.end - h.start), 0));

			// Exactly the hole ranges, and nothing else, are gone. Compared this way
			// rather than against `path[0]`: paper's union emits contours in no
			// particular order, so the first contour of a merged band is often a
			// hole rather than its outer shell.
			const inHole = new Set<number>();
			for (const hole of holes) {
				for (let i = hole.start; i < hole.end; i += 1) inHole.add(i);
			}
			expect(dropped).toEqual(path.filter((_, i) => !inHole.has(i)));
			// Whatever survives is still a valid path: it starts with a move.
			if (dropped.length > 0) expect(dropped[0][0]).toBe('M');
		}
	});

	it('runs stage 2 over every band in well under a second', () => {
		const work = payloads.map((p) => ({ payload: p, path: merged.get(p.id) }));
		const start = performance.now();
		for (const { payload, path } of work) {
			if (!path) continue;
			dropHoles(path, buildContourIndex(path, payload, tiledConfig.type), {
				dropHoles: { mode: 'random', chance: 0.5 },
				runSeed: 0
			});
		}
		expect(performance.now() - start).toBeLessThan(1000);
	});
});
