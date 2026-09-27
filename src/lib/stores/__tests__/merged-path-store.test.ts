import { describe, it, expect, afterEach } from '@jest/globals';
import { get } from 'svelte/store';
import {
	mergedBandPaths,
	mergedBandPathsRaw,
	bandContourIndexes,
	applyPostProcess,
	isPrepared
} from '../mergedPathStore';
import { patternConfigStore } from '../globulePatternStores';
import { concatPieces } from '$lib/cut-pattern/drop-holes';
import type { BandContourIndex } from '$lib/cut-pattern/contour-index';
import type { PathSegment } from '$lib/types';

describe('merged path stores', () => {
	it('starts empty and unprepared', () => {
		expect(get(mergedBandPathsRaw).size).toBe(0);
		expect(get(isPrepared)).toBe(false);
	});

	it('marks prepared once the raw store is written, and unprepared when cleared', () => {
		const raw = new Map<string, PathSegment[]>([['b', [['M', 0, 0]]]]);
		mergedBandPathsRaw.set(raw);

		expect(get(isPrepared)).toBe(true);

		mergedBandPathsRaw.set(new Map());
		expect(get(isPrepared)).toBe(false);
	});
});

const donut = (): PathSegment[] => [
	['M', 0, 0],
	['L', 10, 0],
	['L', 10, 10],
	['L', 0, 10],
	['Z'],
	['M', 4, 4],
	['L', 6, 4],
	['L', 6, 6],
	['L', 4, 6],
	['Z']
];

const oneHole = (seed = 1): Map<string, BandContourIndex> =>
	new Map([
		[
			'b',
			{
				seed,
				contours: [
					{ start: 0, end: 5, kind: 'outline', depth: 0, area: 100 },
					{ start: 5, end: 10, kind: 'hole', depth: 1, bandFraction: 0.5, area: 4 }
				]
			}
		]
	]);

describe('post-processed merged paths', () => {
	afterEach(() => {
		mergedBandPathsRaw.set(new Map());
		bandContourIndexes.set(new Map());
		patternConfigStore.update((c) => {
			c.patternConfig.postProcess = { dropHoles: { mode: 'none' }, runSeed: 0 };
			return c;
		});
	});

	it('passes paths through untouched when dropping is off', () => {
		const raw = new Map([['b', donut()]]);
		const out = applyPostProcess(raw, oneHole(), { dropHoles: { mode: 'none' }, runSeed: 0 });

		expect(concatPieces(out.get('b')!)).toEqual(donut());
	});

	it('drops the hole in all mode', () => {
		const raw = new Map([['b', donut()]]);
		const out = applyPostProcess(raw, oneHole(), { dropHoles: { mode: 'all' }, runSeed: 0 });

		expect(concatPieces(out.get('b')!)).toHaveLength(5);
	});

	it('drops the outline and keeps the hole', () => {
		const raw = new Map([['b', donut()]]);
		const out = applyPostProcess(raw, oneHole(), {
			dropHoles: { mode: 'none' },
			runSeed: 0,
			dropOutline: true
		});

		expect(concatPieces(out.get('b')!)).toEqual(donut().slice(5));
	});

	it('leaves a band with no index untouched', () => {
		const raw = new Map([['b', donut()]]);
		const out = applyPostProcess(raw, new Map(), { dropHoles: { mode: 'all' }, runSeed: 0 });

		expect(concatPieces(out.get('b')!)).toEqual(donut());
	});

	it('re-derives the render-facing store when the config changes, without touching raw', () => {
		mergedBandPathsRaw.set(new Map([['b', donut()]]));
		bandContourIndexes.set(oneHole());
		expect(concatPieces(get(mergedBandPaths).get('b')!)).toHaveLength(10);

		patternConfigStore.update((c) => {
			c.patternConfig.postProcess = { dropHoles: { mode: 'all' }, runSeed: 0 };
			return c;
		});

		expect(concatPieces(get(mergedBandPaths).get('b')!)).toHaveLength(5);
		expect(get(mergedBandPathsRaw).get('b')).toHaveLength(10);
	});

	it('re-derives on a reroll, leaving the raw store and the indexes alone', () => {
		// 40 holes so two seeds almost certainly disagree on at least one.
		const path: PathSegment[] = [];
		for (let i = 0; i <= 40; i += 1) {
			path.push(['M', i, 0], ['L', i + 1, 0], ['L', i + 1, 1], ['L', i, 1], ['Z']);
		}
		const indexes = new Map<string, BandContourIndex>([
			[
				'b',
				{
					seed: 5,
					contours: [
						{ start: 0, end: 5, kind: 'outline', depth: 0, area: 1 },
						...Array.from({ length: 40 }, (_, i) => ({
							start: (i + 1) * 5,
							end: (i + 2) * 5,
							kind: 'hole' as const,
							depth: 1,
							bandFraction: i / 39,
							area: 1
						}))
					]
				}
			]
		]);
		mergedBandPathsRaw.set(new Map([['b', path]]));
		bandContourIndexes.set(indexes);
		patternConfigStore.update((c) => {
			c.patternConfig.postProcess = { dropHoles: { mode: 'random', chance: 0.5 }, runSeed: 0 };
			return c;
		});
		const before = get(mergedBandPaths).get('b');

		patternConfigStore.update((c) => {
			c.patternConfig.postProcess = { dropHoles: { mode: 'random', chance: 0.5 }, runSeed: 1 };
			return c;
		});

		expect(get(mergedBandPaths).get('b')).not.toEqual(before);
		expect(get(mergedBandPathsRaw).get('b')).toBe(path);
		expect(get(bandContourIndexes).get('b')!.seed).toBe(5);
	});
});
