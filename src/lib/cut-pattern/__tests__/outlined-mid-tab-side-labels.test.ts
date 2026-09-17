import { describe, it, expect, beforeAll } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	defaultOutlinedPatternConfig,
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig
} from '$lib/shades-config';
import { getQuadrilaterals } from '$lib/patterns/quadrilateral';
import { getEdge } from '$lib/projection-geometry/generate-projection';
import { runPatternGeneration } from '../run-pattern-generation';
import { resolveTabLabel } from '../resolve-tab-label';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type {
	BandCutPattern,
	OutlinedPatternConfig,
	PipelineGates,
	Point,
	Quadrilateral,
	SplitConfig,
	TubeCutPattern
} from '$lib/types';

/**
 * A mid tab's label names the band across the edge the tab sits on: a before
 * edge borders band - 1, an after edge band + 1 (wrapping within the tube). The
 * first tab on each tabbed side carries the label; a later tab on that side is
 * labelled only where the neighbour piece it borders changes, so an unsplit
 * neighbour gets exactly one label per side.
 *
 * Real, unmocked generation on the default superglobule (30 tubes × 6 closed
 * bands; `tubeSymmetry: 'lateral'`, so bands 0-2 are axial-right and 3-5
 * axial-left). The side and quad of each tab are read from geometry,
 * independently of the tab record: a before edge runs quad a → d, an after edge
 * c → b.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

let superGlobule: ReturnType<typeof generateSuperGlobule>;
const superConfig = generateDefaultSuperGlobuleConfig();

const generate = (
	tabConfig: Partial<NonNullable<OutlinedPatternConfig['tabConfig']>>,
	splits?: SplitConfig
): TubeCutPattern[] => {
	const config = defaultOutlinedPatternConfig();
	config.tabConfig = { ...config.tabConfig!, shape: 'rectangle', ...tabConfig };
	const genConfig: PatternGenerationConfig = {
		patternTypeConfig: config,
		pixelScale: generateDefaultGlobulePatternConfig().patternConfig.pixelScale,
		showBands: true,
		range: { tubes: undefined, bands: undefined, facets: undefined },
		patternSource: 'projection',
		...(splits ? { splits } : {})
	};
	const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });
	const pattern = result.projectionPattern as SuperGlobuleProjectionCutPattern;
	expect(pattern.rejectedSplits ?? []).toEqual([]);
	return pattern.projectionCutPattern.tubes;
};

type Side = 'before' | 'after';
type MidTab = { band: BandCutPattern; side: Side; quad: number; label: string };

const near = (p: Point, q: { x: number; y: number }) =>
	Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;

/** The side and band-local quad of `base`, from the band's own quads. */
const edgeFromGeometry = (band: BandCutPattern, base: [Point, Point]) => {
	const quads = band.facets.map((f) => f.quad).filter((q): q is Quadrilateral => !!q);
	for (let quad = 0; quad < quads.length; quad++) {
		const q = quads[quad];
		if (near(base[0], q.a) && near(base[1], q.d)) return { side: 'before' as Side, quad };
		if (near(base[0], q.c) && near(base[1], q.b)) return { side: 'after' as Side, quad };
	}
	throw new Error(`tab base matches no quad edge of ${JSON.stringify(band.address)}`);
};

/** Every mid tab of every band in walk order, with geometric side/quad and label. */
const midTabs = (tubes: TubeCutPattern[]) =>
	tubes.map((tube) => ({
		tube: tube.address.tube,
		count: new Set(tube.bands.map((b) => b.address.band)).size,
		tabs: tube.bands.flatMap((band) =>
			(band.tabs ?? [])
				.filter((t) => t.position === 'mid')
				.map(
					(t): MidTab => ({
						band,
						...edgeFromGeometry(band, t.base),
						label: resolveTabLabel(t, band, tube, tubes)
					})
				)
		)
	}));

const bandKey = (b: BandCutPattern) =>
	`b${b.address.band}${'piece' in b.address ? `p${b.address.piece}` : ''}`;

/** The (band, side) groups of one tube's mid tabs, each in walk order. */
const sideGroups = (tabs: MidTab[]) => {
	const groups = new Map<string, MidTab[]>();
	for (const t of tabs) {
		const key = `${bandKey(t.band)}:${t.side}`;
		groups.set(key, [...(groups.get(key) ?? []), t]);
	}
	return groups;
};

const parseLabel = (label: string) => {
	const m = /^t(\d+)\/b(\d+)(?:p(\d+))?$/.exec(label);
	return m
		? { tube: +m[1], band: +m[2], piece: m[3] === undefined ? undefined : +m[3] }
		: undefined;
};

/**
 * For every (band, side) that carries tabs: the first tab is labelled with
 * parent band ∓ 1, and every other label names a different piece of that same
 * band. On unsplit geometry that is exactly one label per side. Returns the
 * mismatches, empty when correct.
 */
const sideMismatches = (tubes: TubeCutPattern[]): string[] => {
	const problems: string[] = [];
	for (const { tube, count, tabs } of midTabs(tubes)) {
		for (const [key, group] of sideGroups(tabs)) {
			const { band, side } = group[0];
			const across = (band.address.band + (side === 'before' ? -1 : 1) + count) % count;
			const labels = group.map((t) => t.label);
			const seen = new Set<string>();
			const ok = labels.every((label, i) => {
				if (!label) return i > 0;
				const parsed = parseLabel(label);
				if (!parsed || parsed.tube !== tube || parsed.band !== across) return false;
				if (seen.has(label)) return false;
				seen.add(label);
				return i === 0 || parsed.piece !== undefined;
			});
			if (!ok) problems.push(`t${tube} ${key}: [${labels.join(',')}] across b${across}`);
		}
	}
	return problems;
};

describe('outlined mid tab labels name the band across their edge (real default geometry)', () => {
	beforeAll(() => {
		superGlobule = generateSuperGlobule(superConfig, gates);
	});

	it("bandEdge 'before': every labelled mid tab names band - 1, one label per band", () => {
		const tubes = generate({ bandEdge: 'before' });
		const all = midTabs(tubes).flatMap((t) => t.tabs);
		expect(all.length).toBeGreaterThan(0);
		expect(all.every((t) => t.side === 'before')).toBe(true);
		expect(sideMismatches(tubes)).toEqual([]);
		expect(all.filter((t) => t.label).length).toBe(180);
	});

	it("bandEdge 'beforeAndAfter': before tabs name band - 1, after tabs band + 1", () => {
		const tubes = generate({ bandEdge: 'beforeAndAfter' });
		const all = midTabs(tubes).flatMap((t) => t.tabs);
		expect([...new Set(all.map((m) => m.side))].sort()).toEqual(['after', 'before']);
		expect(sideMismatches(tubes)).toEqual([]);
		expect(all.filter((t) => t.label).length).toBe(360);
	});

	it('labels name the physical 3D neighbour on both axial-right and axial-left bands', () => {
		// Oracle: the 3D band's own quad at the tab's quad; the facet (2q or 2q+1)
		// whose OUTER edge (orientation-aware `getEdge`) is that quad's a-d edge
		// (before) or b-c edge (after); that edge's partner band.
		const tubes = generate({ bandEdge: 'beforeAndAfter' });
		const tubes3d = superGlobule.projections[0].tubes;
		const orientations = new Set<string>();
		const problems: string[] = [];
		for (const { tube, tabs } of midTabs(tubes)) {
			for (const [key, group] of sideGroups(tabs)) {
				const { band, side, quad, label } = group[0];
				const band3d = tubes3d[tube].bands[band.address.band];
				orientations.add(band3d.orientation);
				const q = getQuadrilaterals(band3d, 1, 'outside')[quad];
				const [p, r] = side === 'before' ? [q.a, q.d] : [q.b, q.c];
				const partners = [2 * quad, 2 * quad + 1].flatMap((fi) => {
					const facet = band3d.facets[fi];
					const outer = getEdge('outer', fi, facet.orientation);
					const vertex = (key: string) => facet.triangle[key as 'a' | 'b' | 'c'];
					const [e0, e1] = [vertex(outer[0]), vertex(outer[1])];
					const same = (u: typeof e0, v: typeof e0) => u.distanceTo(v) < 1e-6;
					const onEdge = (same(e0, p) && same(e1, r)) || (same(e0, r) && same(e1, p));
					return onEdge ? [facet.meta![outer]!.partner!] : [];
				});
				const expected =
					partners.length === 1 ? `t${partners[0].tube}/b${partners[0].band}` : '(no outer edge)';
				if (label !== expected) {
					problems.push(`t${tube} ${key} ${band3d.orientation}: ${label} ≠ ${expected}`);
				}
			}
		}
		expect([...orientations].sort()).toEqual(['axial-left', 'axial-right']);
		expect(problems).toEqual([]);
	});

	it('wraps: band 0 before names the last band, the last band after names band 0', () => {
		const labelOf = (tubes: TubeCutPattern[], band: number, side: Side) =>
			midTabs(tubes)[0]
				.tabs.filter((t) => t.band.address.band === band && t.side === side)
				.map((t) => t.label)
				.filter(Boolean);
		const tubes = generate({ bandEdge: 'beforeAndAfter' });
		expect(labelOf(tubes, 0, 'before')).toEqual(['t0/b5']);
		expect(labelOf(tubes, 5, 'after')).toEqual(['t0/b0']);
	});

	it("tabLayout 'inner': each seam's single tabbed side names the band across the seam", () => {
		const tubes = generate({ bandEdge: 'after', tabLayout: 'inner' });
		expect(sideMismatches(tubes)).toEqual([]);
		// Seam s joins bands s and s + 1: exactly one of them tabs its facing side,
		// and that side's label names the other band.
		const problems: string[] = [];
		for (const { tube, count, tabs } of midTabs(tubes)) {
			for (let s = 0; s < count - 1; s++) {
				const facing = tabs.filter(
					({ band, side }) =>
						(band.address.band === s && side === 'after') ||
						(band.address.band === s + 1 && side === 'before')
				);
				const owners = new Set(facing.map((t) => t.band.address.band));
				const labels = facing.map((t) => t.label).filter(Boolean);
				const expected = owners.has(s) ? `t${tube}/b${s + 1}` : `t${tube}/b${s}`;
				if (owners.size !== 1 || labels.length !== 1 || labels[0] !== expected) {
					problems.push(`t${tube} seam ${s}: owners ${[...owners]} labels [${labels.join(' ')}]`);
				}
			}
		}
		expect(problems).toEqual([]);
	});

	describe('split geometry', () => {
		// Tube 0 cut at quads 1 and 2: pieces of UNEQUAL length (1, 1, 2 quads).
		const splits: SplitConfig = { tubeSplits: [{ tube: 0, quads: [1, 2] }] };

		it('tube-wide split: each piece gets one label per side, naming the matching piece', () => {
			const tubes = generate({ bandEdge: 'beforeAndAfter' }, splits);
			expect(sideMismatches(tubes)).toEqual([]);
			const pieces = midTabs(tubes)[0].tabs.filter((t) => 'piece' in t.band.address);
			expect(pieces.length).toBeGreaterThan(0);
			for (const [, group] of sideGroups(pieces)) {
				const labels = group.map((t) => t.label).filter(Boolean);
				const own = group[0].band.address as { piece: number };
				expect(labels).toHaveLength(1);
				expect(parseLabel(labels[0])?.piece).toBe(own.piece);
			}
		});

		it('an uncut band beside split neighbours is labelled once per neighbour piece', () => {
			// Real tab records: tube 0 from the split run, with parent band 2's pieces
			// replaced by the uncut band 2 from the unsplit run. Its before side borders
			// b1's pieces, its after side b3's.
			const split = generate({ bandEdge: 'beforeAndAfter' }, splits);
			const unsplit = generate({ bandEdge: 'beforeAndAfter' });
			const uncut = unsplit[0].bands[2];
			const bands = split[0].bands.flatMap((b) =>
				b.address.band !== 2 ? [b] : 'piece' in b.address && b.address.piece === 0 ? [uncut] : []
			);
			const tubes = [{ ...split[0], bands }, ...split.slice(1)];
			const groups = sideGroups(midTabs(tubes)[0].tabs.filter((t) => t.band === uncut));
			const labelsAt = (side: Side) =>
				groups.get(`b2:${side}`)!.map((t) => `q${t.quad}:${t.label}`);
			// Before is walked low → high quad, after high → low: each piece is named
			// at the first quad of it reached in walk order.
			expect(labelsAt('before')).toEqual(['q0:t0/b1p0', 'q1:t0/b1p1', 'q2:t0/b1p2', 'q3:']);
			expect(labelsAt('after')).toEqual(['q3:t0/b3p2', 'q2:', 'q1:t0/b3p1', 'q0:t0/b3p0']);
			expect(sideMismatches(tubes)).toEqual([]);
		});
	});
});
