import type { BezierConfig, PointConfig2 } from '$lib/types';

export type HoleDropMode = 'none' | 'all' | 'random' | 'variable';

/**
 * How internal holes are dropped from a merged tiled band.
 *
 * `random` drops each hole independently with probability `chance`.
 * `variable` reads the curve as x = position along the band, y = drop chance.
 */
export type HoleDropConfig =
	| { mode: 'none' }
	| { mode: 'all' }
	| { mode: 'random'; chance: number }
	| { mode: 'variable'; curve: BezierConfig[] };

/**
 * `runSeed` is persisted with the config so a reopened design re-cuts
 * identically; the Reroll button bumps it. It is read at stage 2 only — see
 * `seedFor` in `drop-holes.ts` for why it cannot live in the band payload.
 */
export type PostProcessConfig = { dropHoles: HoleDropConfig; runSeed: number };

export const DEFAULT_POST_PROCESS: PostProcessConfig = {
	dropHoles: { mode: 'none' },
	runSeed: 0
};

const pt = (x: number, y: number): PointConfig2 => ({ type: 'PointConfig2', x, y });

/** A flat 50%-everywhere curve: a neutral starting point in the editor. */
export const defaultDropCurve = (): BezierConfig[] => [
	{ type: 'BezierConfig', points: [pt(0, 0.5), pt(1 / 3, 0.5), pt(2 / 3, 0.5), pt(1, 0.5)] }
];

export const LUT_SAMPLES = 101;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const cubic = (a: number, b: number, c: number, d: number, t: number): number => {
	const u = 1 - t;
	return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/** y of the curve run at parameter x, by bisection on t. Assumes x is monotone. */
const yAtX = (curve: BezierConfig[], x: number): number => {
	// Pick the sub-curve whose x-range covers x; fall back to the last one.
	let chosen = curve[curve.length - 1];
	for (const c of curve) {
		const x0 = c.points[0].x;
		const x3 = c.points[3].x;
		if (x >= Math.min(x0, x3) && x <= Math.max(x0, x3)) {
			chosen = c;
			break;
		}
	}
	const [p0, c1, c2, p1] = chosen.points;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 24; i += 1) {
		const mid = (lo + hi) / 2;
		if (cubic(p0.x, c1.x, c2.x, p1.x, mid) < x) lo = mid;
		else hi = mid;
	}
	const t = (lo + hi) / 2;
	return clamp01(cubic(p0.y, c1.y, c2.y, p1.y, t));
};

/**
 * Sample a drop curve into a plain-number lookup table.
 *
 * The table, not the curve, is what stage 2 reads: it keeps the hot path free
 * of curve maths and keeps everything downstream trivially cloneable.
 */
export const sampleDropCurve = (curve: BezierConfig[], samples = LUT_SAMPLES): number[] => {
	if (!curve || curve.length === 0) return new Array(samples).fill(0);
	const lut = new Array<number>(samples);
	for (let i = 0; i < samples; i += 1) {
		lut[i] = yAtX(curve, i / (samples - 1));
	}
	return lut;
};

/** Linear interpolation into a sampled table, with x clamped to [0, 1]. */
export const lookup = (lut: number[], x: number): number => {
	if (lut.length === 0) return 0;
	if (lut.length === 1) return lut[0];
	const pos = clamp01(x) * (lut.length - 1);
	const i = Math.floor(pos);
	if (i >= lut.length - 1) return lut[lut.length - 1];
	const t = pos - i;
	return lut[i] * (1 - t) + lut[i + 1] * t;
};
