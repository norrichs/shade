import { describe, it, expect } from '@jest/globals';
import { get } from 'svelte/store';
import {
	mergedBandPaths,
	mergedBandPathsRaw,
	postProcessBandPaths,
	isPrepared
} from '../mergedPathStore';
import type { PathSegment } from '$lib/types';

describe('merged path stores', () => {
	it('starts empty and unprepared', () => {
		expect(get(mergedBandPathsRaw).size).toBe(0);
		expect(get(isPrepared)).toBe(false);
	});

	it('passes paths through post-processing unchanged for now', () => {
		const raw = new Map<string, PathSegment[]>([['b', [['M', 0, 0]]]]);
		expect(postProcessBandPaths(raw)).toEqual(raw);
	});

	it('marks prepared once the render-facing store is written', () => {
		const raw = new Map<string, PathSegment[]>([['b', [['M', 0, 0]]]]);
		mergedBandPathsRaw.set(raw);
		mergedBandPaths.set(postProcessBandPaths(raw));

		expect(get(isPrepared)).toBe(true);

		mergedBandPathsRaw.set(new Map());
		mergedBandPaths.set(new Map());
		expect(get(isPrepared)).toBe(false);
	});
});
