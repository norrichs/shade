import type { PathSegment } from '$lib/types';
import { insertKeepConnectedBreak } from '../keep-connected';

// Closed square, top edge at y=0 (SVG y grows downward, so y=0 is the top).
const square = (): PathSegment[] => [['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10], ['Z']];

describe('insertKeepConnectedBreak', () => {
	test('inserts a centered gap on the topmost straight edge and opens the path', () => {
		const result = insertKeepConnectedBreak(square(), 2);
		// gap of 2 centered at the midpoint (5,0) of the top edge → 4..6.
		expect(result).toEqual([
			['M', 6, 0],
			['L', 10, 0],
			['L', 10, 10],
			['L', 0, 10],
			['L', 0, 0],
			['L', 4, 0]
		]);
	});

	test('result is an open path (no Z) with a gap of exactly `gap` wide', () => {
		const result = insertKeepConnectedBreak(square(), 2);
		expect(result.some((s) => s[0] === 'Z')).toBe(false);
		const gapEnd = result[0]; // M gapEnd
		const gapStart = result[result.length - 1]; // L gapStart
		const dist = Math.hypot(
			(gapEnd[1] as number) - (gapStart[1] as number),
			(gapEnd[2] as number) - (gapStart[2] as number)
		);
		expect(dist).toBeCloseTo(2);
	});

	test('gap <= 0 returns the path unchanged', () => {
		const path = square();
		expect(insertKeepConnectedBreak(path, 0)).toBe(path);
		expect(insertKeepConnectedBreak(path, -5)).toBe(path);
	});

	test('returns unchanged when no straight segment is longer than the gap', () => {
		const path = square();
		expect(insertKeepConnectedBreak(path, 100)).toBe(path);
	});

	test('chooses a longer lower edge when the top edge is too short', () => {
		// Top edge length 1 (too short for gap 2); the right edge (length 10) is the
		// topmost remaining candidate, so the break lands there, not on the top.
		const path: PathSegment[] = [['M', 0, 0], ['L', 1, 0], ['L', 1, 10], ['L', 0, 10], ['Z']];
		const result = insertKeepConnectedBreak(path, 2);
		expect(result.some((s) => s[0] === 'Z')).toBe(false);
		// Break is on the x=1 right edge (gap points share x=1).
		expect(result[0][1]).toBe(1);
	});

	test('leaves curve segments alone (never breaks on them) and keeps them verbatim', () => {
		// Square with the top edge replaced by a cubic; only straight edges qualify.
		const path: PathSegment[] = [
			['M', 0, 0],
			['C', 3, -2, 7, -2, 10, 0],
			['L', 10, 10],
			['L', 0, 10],
			['Z']
		];
		const result = insertKeepConnectedBreak(path, 2);
		// The cubic is preserved exactly somewhere in the rebuilt path.
		expect(result).toContainEqual(['C', 3, -2, 7, -2, 10, 0]);
		expect(result.some((s) => s[0] === 'Z')).toBe(false);
	});

	test('returns compound paths (more than one M) unchanged', () => {
		const compound: PathSegment[] = [
			['M', 0, 0],
			['L', 10, 0],
			['L', 10, 10],
			['Z'],
			['M', 20, 20],
			['L', 30, 20],
			['L', 30, 30],
			['Z']
		];
		expect(insertKeepConnectedBreak(compound, 2)).toBe(compound);
	});
});
