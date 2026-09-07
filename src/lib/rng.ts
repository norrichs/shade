/**
 * Mulberry32 — a small, fast, seedable PRNG.
 *
 * Used wherever generated geometry must be stable across re-derivation: the
 * 2D pattern pipeline runs in a main-thread derived store and re-runs on every
 * config change, so an unseeded `Math.random` would reshuffle the pattern on
 * each keystroke.
 *
 * Returns a closure yielding numbers in [0, 1).
 */
export const mulberry32 = (seed: number): (() => number) => {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};
