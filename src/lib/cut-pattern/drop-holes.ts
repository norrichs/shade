import type { PathSegment } from '$lib/types';
import type { BandHoleIndex } from './hole-index';
import { lookup, sampleDropCurve, type PostProcessConfig } from './hole-drop-config';

/**
 * Mulberry32: a small, fast, well-distributed 32-bit PRNG.
 *
 * Stage 2 must never call `Math.random()`. Bands are merged by a pool, so which
 * worker handled which band varies with scheduling; unseeded randomness would
 * give a different cut file on every prepare, for output that gets cut on a
 * machine. Seeding per band makes the result depend only on the band and the
 * run seed.
 */
export const mulberry32 = (seed: number) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/**
 * Combine a band's base seed with the run seed.
 *
 * The base seed is baked into the payload at extraction time, BEFORE the merge,
 * so it cannot carry `runSeed` — rerolling would then mean re-merging, which is
 * the seconds this whole split exists to avoid. Mixing here keeps Reroll a
 * stage-2 change: same merge, new arrangement.
 */
export const seedFor = (baseSeed: number, runSeed: number): number =>
	(Math.imul(baseSeed ^ runSeed, 0x9e3779b1) ^ (runSeed >>> 0)) >>> 0;

/**
 * Rebuild `path` without the contours at the given index ranges.
 *
 * Ranges are `[start, end)` into `path` and never overlap, so one ordered walk
 * does it. Removing an inner contour fills its space, because the renderer
 * fills `evenodd`; nothing is re-unioned.
 */
const withoutRanges = (path: PathSegment[], ranges: { start: number; end: number }[]) => {
	const ordered = [...ranges].sort((a, b) => a.start - b.start);
	const out: PathSegment[] = [];
	let cursor = 0;
	for (const range of ordered) {
		for (let i = cursor; i < range.start; i += 1) out.push(path[i]);
		cursor = range.end;
	}
	for (let i = cursor; i < path.length; i += 1) out.push(path[i]);
	return out;
};

/**
 * Stage 2: drop internal holes from one merged band path.
 *
 * Pure. Rolls the PRNG once per hole in index order — which is contour order,
 * deterministic from the path — so the result is identical run to run whatever
 * the pool did.
 */
export const dropHoles = (
	path: PathSegment[],
	index: BandHoleIndex,
	config: PostProcessConfig
): PathSegment[] => {
	const mode = config.dropHoles;
	if (mode.mode === 'none') return path;
	if (index.holes.length === 0) return path;
	if (mode.mode === 'all') return withoutRanges(path, index.holes);

	const random = mulberry32(seedFor(index.seed, config.runSeed));
	// Resolved once, outside the loop: `variable` reads a sampled table at each
	// hole's position along the band, `random` uses one flat chance.
	const lut = mode.mode === 'variable' ? sampleDropCurve(mode.curve) : null;
	const flatChance = mode.mode === 'random' ? mode.chance : 0;
	const dropped: { start: number; end: number }[] = [];

	for (const hole of index.holes) {
		const chance = lut ? lookup(lut, hole.bandFraction) : flatChance;
		// Roll for EVERY hole, whatever the chance, so the sequence a hole sees
		// does not shift when the curve or chance changes.
		if (random() < chance) dropped.push({ start: hole.start, end: hole.end });
	}
	return dropped.length === 0 ? path : withoutRanges(path, dropped);
};
