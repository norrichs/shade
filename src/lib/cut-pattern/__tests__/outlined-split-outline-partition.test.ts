import { describe, it, expect, beforeAll } from '@jest/globals';
import { defaultOutlinedPatternConfig } from '$lib/shades-config';
import {
	buildDefaultGeometry,
	generateProjectionTubes,
	partsOf,
	pieceOf,
	splitAllTubesAt,
	type P,
	type RealGeometry
} from './helpers/real-geometry';
import type {
	BandCutPattern,
	OutlinedPatternConfig,
	PathSegment,
	Quadrilateral,
	TubeCutPattern
} from '$lib/types';

/**
 * Outlined split pieces partition the parent's outline (final review; Task 4's
 * tests stubbed flatten and align).
 *
 * Real, unmocked generation on the default superglobule (30 tubes × 6 bands,
 * 4 quads per band), outlined with no tabs so the outline path is exactly the
 * band's boundary edges. Every tube is cut into UNEQUAL pieces.
 *
 * Each piece is flattened and aligned on its own, so it sits in its own frame.
 * The oracle maps every piece into its unsplit parent's frame by the rigid
 * motion taking the piece's first quad (a, b) onto the parent's quad at the
 * piece's parent quad offset. The offset is computed here from the sibling
 * pieces' quad counts, independently of the code under test; the mapped
 * piece's every quad vertex must land on the parent's (fixture guard: the
 * motion is rigid and the right quads were paired).
 *
 * Then, as multisets of undirected segments in the parent frame:
 * - the pieces' segments, minus the seam segments, equal the unsplit band's
 *   outline segments exactly: the sides concatenate to the parent's sides and
 *   the outer caps are the parent's caps;
 * - every seam segment (the parent quad boundary at a cut, quad s's a→b) appears
 *   exactly twice, once on each piece beside the cut, and nowhere else is there
 *   a cap: any other extra segment fails the first check.
 */

const TOLERANCE = 1e-6;

type Segment = [P, P];

const noTabs = (): OutlinedPatternConfig => {
	const config = defaultOutlinedPatternConfig();
	delete config.tabConfig;
	return config;
};

/** The outline's segments: consecutive vertices of its M/L/Z path. */
const outlineSegments = (band: BandCutPattern): Segment[] => {
	const path = band.facets[0].path as PathSegment[];
	const points: P[] = [];
	for (const seg of path) {
		if (seg[0] === 'M' || seg[0] === 'L') points.push({ x: seg[1], y: seg[2] });
		else if (seg[0] === 'Z') points.push(points[0]);
		else throw new Error(`unexpected outline segment ${seg[0]}`);
	}
	return points.slice(1).map((p, i) => [points[i], p]);
};

const quadsOf = (band: BandCutPattern): Quadrilateral[] =>
	band.facets.filter((f) => f.quad).map((f) => f.quad!);

/** The rigid motion taking segment (from0, from1) onto (to0, to1). */
const rigidMotion = (from0: P, from1: P, to0: P, to1: P) => {
	const angle =
		Math.atan2(to1.y - to0.y, to1.x - to0.x) - Math.atan2(from1.y - from0.y, from1.x - from0.x);
	const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
	return (p: P): P => {
		const [dx, dy] = [p.x - from0.x, p.y - from0.y];
		return { x: to0.x + dx * cos - dy * sin, y: to0.y + dx * sin + dy * cos };
	};
};

const near = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y) < TOLERANCE;
const sameSegment = ([a0, a1]: Segment, [b0, b1]: Segment) =>
	(near(a0, b0) && near(a1, b1)) || (near(a0, b1) && near(a1, b0));
const isDegenerate = ([a, b]: Segment) => near(a, b);

/** Removes one match of each of `remove` from `from`; returns what could not be removed. */
const takeOut = (from: Segment[], remove: Segment[]): Segment[] => {
	const missing: Segment[] = [];
	for (const seg of remove) {
		const i = from.findIndex((s) => sameSegment(s, seg));
		if (i < 0) missing.push(seg);
		else from.splice(i, 1);
	}
	return missing;
};

const fmt = ([a, b]: Segment) =>
	`(${a.x.toFixed(2)},${a.y.toFixed(2)})→(${b.x.toFixed(2)},${b.y.toFixed(2)})`;

let geometry: RealGeometry;
let unsplit: TubeCutPattern[];
beforeAll(() => {
	geometry = buildDefaultGeometry();
	unsplit = generateProjectionTubes(geometry, noTabs());
});

describe('outlined split pieces partition the parent outline (real geometry)', () => {
	it('fixture: the unsplit outline is exactly the quads’ boundary (4 quads per band, no tabs)', () => {
		for (const tube of unsplit) {
			for (const band of tube.bands) {
				expect(quadsOf(band)).toHaveLength(4);
				// before side (4) + end cap + after side (4) + start cap
				expect(outlineSegments(band).filter((s) => !isDegenerate(s))).toHaveLength(10);
			}
		}
	});

	it.each([
		['split at 1 (1 + 3)', [1], [1, 3]],
		['split at 1 and 2 (1 + 1 + 2)', [1, 2], [1, 1, 2]]
	])('%s', (_, quads, expectedLengths) => {
		const split = generateProjectionTubes(geometry, noTabs(), splitAllTubesAt(geometry, quads));
		const failures: string[] = [];
		let seams = 0;
		let parents = 0;

		split.forEach((tube, t) => {
			const bandIndices = [...new Set(tube.bands.map((b) => b.address.band))];
			for (const bandIndex of bandIndices) {
				const parent = unsplit[t].bands.find((b) => b.address.band === bandIndex)!;
				const parentQuads = quadsOf(parent);
				const pieces = partsOf(tube, bandIndex);
				expect(pieces.map((p) => quadsOf(p).length)).toEqual(expectedLengths);
				expect(pieces.map(pieceOf)).toEqual(expectedLengths.map((__, i) => i));
				const name = `t${t} b${bandIndex}`;

				const pieceSegments: Segment[] = [];
				let offset = 0;
				for (const piece of pieces) {
					const own = quadsOf(piece);
					const toParent = rigidMotion(
						own[0].a,
						own[0].b,
						parentQuads[offset].a,
						parentQuads[offset].b
					);
					own.forEach((q, i) => {
						for (const k of ['a', 'b', 'c', 'd'] as const) {
							if (!near(toParent(q[k]), parentQuads[offset + i][k])) {
								failures.push(
									`${name} p${pieceOf(piece)} quad ${i}.${k} is not parent quad ${offset + i}`
								);
							}
						}
					});
					for (const [a, b] of outlineSegments(piece)) {
						const mapped: Segment = [toParent(a), toParent(b)];
						if (!isDegenerate(mapped)) pieceSegments.push(mapped);
					}
					offset += own.length;
				}

				// Each cut contributes its seam line once per adjacent piece.
				const seamSegments: Segment[] = quads.flatMap((s): Segment[] => [
					[parentQuads[s].a, parentQuads[s].b],
					[parentQuads[s].a, parentQuads[s].b]
				]);
				const missingSeams = takeOut(pieceSegments, seamSegments);
				missingSeams.forEach((seg) => failures.push(`${name}: seam cap ${fmt(seg)} missing`));
				seams += quads.length;

				const parentSegments = outlineSegments(parent).filter((s) => !isDegenerate(s));
				const missing = takeOut(pieceSegments, parentSegments);
				missing.forEach((seg) => failures.push(`${name}: parent edge ${fmt(seg)} not covered`));
				pieceSegments.forEach((seg) => failures.push(`${name}: extra edge ${fmt(seg)}`));
				parents++;
			}
		});

		expect(failures.slice(0, 10)).toEqual([]);
		// Guards against a vacuous pass: every band of every tube was cut and judged.
		expect(parents).toBe(unsplit.reduce((n, tube) => n + tube.bands.length, 0));
		expect(parents).toBeGreaterThan(100);
		expect(seams).toBe(parents * quads.length);
	});
});
