import type { PathSegment } from '$lib/types';
import { holesOf, type BandContourIndex } from './contour-index';
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

type Range = { start: number; end: number };

/** Concatenate only the segments inside `ranges`, in path order. */
const onlyRanges = (path: PathSegment[], ranges: Range[]) => {
	const ordered = [...ranges].sort((a, b) => a.start - b.start);
	const out: PathSegment[] = [];
	for (const range of ordered) {
		for (let i = range.start; i < range.end; i += 1) out.push(path[i]);
	}
	return out;
};

/**
 * Which holes the drop config removes.
 *
 * Rolls the PRNG once per hole in index order — which is contour order,
 * deterministic from the path — so the result is identical run to run whatever
 * the pool did.
 */
const droppedHoles = (index: BandContourIndex, config: PostProcessConfig): Range[] => {
	const mode = config.dropHoles;
	if (mode.mode === 'none') return [];
	const holes = holesOf(index);
	if (mode.mode === 'all') return holes;

	const random = mulberry32(seedFor(index.seed, config.runSeed));
	// Resolved once, outside the loop: `variable` reads a sampled table at each
	// hole's position along the band, `random` uses one flat chance.
	const lut = mode.mode === 'variable' ? sampleDropCurve(mode.curve) : null;
	const flatChance = mode.mode === 'random' ? mode.chance : 0;
	const dropped: Range[] = [];

	for (const hole of holes) {
		const chance = lut ? lookup(lut, hole.bandFraction) : flatChance;
		// Roll for EVERY hole, whatever the chance, so the sequence a hole sees
		// does not shift when the curve or chance changes.
		if (random() < chance) dropped.push({ start: hole.start, end: hole.end });
	}
	return dropped;
};

/**
 * Stage 2: drop internal holes from one merged band path.
 *
 * Pure. See `droppedHoles` for why the result is deterministic.
 */
export const dropHoles = (
	path: PathSegment[],
	index: BandContourIndex,
	config: PostProcessConfig
): PathSegment[] => {
	if (config.dropHoles.mode === 'none') return path;
	if (holesOf(index).length === 0) return path;
	const dropped = droppedHoles(index, config);
	return dropped.length === 0 ? path : withoutRanges(path, dropped);
};

/**
 * Stage 2 for one band: drop holes, then — with `dropOutline` — drop every
 * contour that is not a hole, keeping only the holes that survived.
 *
 * The index lists every odd-depth contour, so "not a hole" is the outer shell
 * (which carries the unioned label tag) plus any island nested inside a hole.
 * A band with no holes loses its whole path.
 */
export const postProcessBandPath = (
	path: PathSegment[],
	index: BandContourIndex,
	config: PostProcessConfig
): PathSegment[] => {
	if (!config.dropOutline) return dropHoles(path, index, config);
	const dropped = new Set(droppedHoles(index, config).map((r) => r.start));
	return onlyRanges(
		path,
		holesOf(index).filter((hole) => !dropped.has(hole.start))
	);
};
