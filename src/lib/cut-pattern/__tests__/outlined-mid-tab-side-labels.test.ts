import { describe, it, expect, beforeAll } from '@jest/globals';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	defaultOutlinedPatternConfig,
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig
} from '$lib/shades-config';
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
	TubeCutPattern
} from '$lib/types';

/**
 * A mid tab's label names the band across the edge the tab sits on: a before
 * edge borders band - 1, an after edge band + 1 (wrapping within the tube). The
 * first tab on each tabbed side carries the label; later tabs on that side are
 * blank.
 *
 * Real, unmocked generation on the default superglobule (30 tubes × 6 closed
 * bands). The side of each tab is read from geometry, independently of the tab
 * record: a before edge runs quad a → d, an after edge c → b.
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
	tabConfig: Partial<NonNullable<OutlinedPatternConfig['tabConfig']>>
): TubeCutPattern[] => {
	const config = defaultOutlinedPatternConfig();
	config.tabConfig = { ...config.tabConfig!, shape: 'rectangle', ...tabConfig };
	const genConfig: PatternGenerationConfig = {
		patternTypeConfig: config,
		pixelScale: generateDefaultGlobulePatternConfig().patternConfig.pixelScale,
		showBands: true,
		range: { tubes: undefined, bands: undefined, facets: undefined },
		patternSource: 'projection'
	};
	const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });
	return (result.projectionPattern as SuperGlobuleProjectionCutPattern).projectionCutPattern.tubes;
};

type Side = 'before' | 'after';
type MidTab = { band: number; side: Side; label: string };

const near = (p: Point, q: { x: number; y: number }) =>
	Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;

/** The side of `base` from the band's own quads: a → d is before, c → b after. */
const sideFromGeometry = (band: BandCutPattern, base: [Point, Point]): Side => {
	const quads = band.facets.map((f) => f.quad).filter((q): q is Quadrilateral => !!q);
	for (const q of quads) {
		if (near(base[0], q.a) && near(base[1], q.d)) return 'before';
		if (near(base[0], q.c) && near(base[1], q.b)) return 'after';
	}
	throw new Error(`tab base matches no quad edge of ${JSON.stringify(band.address)}`);
};

/** Every mid tab of every band, with its geometric side and resolved label. */
const midTabs = (tubes: TubeCutPattern[]) =>
	tubes.map((tube) => ({
		tube: tube.address.tube,
		count: tube.bands.length,
		tabs: tube.bands.flatMap((band) =>
			(band.tabs ?? [])
				.filter((t) => t.position === 'mid')
				.map(
					(t): MidTab => ({
						band: band.address.band,
						side: sideFromGeometry(band, t.base),
						label: resolveTabLabel(t, band, tube, tubes)
					})
				)
		)
	}));

const across = (tube: number, band: number, side: Side, count: number) =>
	`t${tube}/b${(band + (side === 'before' ? -1 : 1) + count) % count}`;

/**
 * For every (band, side) that carries tabs: exactly one tab is labelled, and it
 * names the band across that side. Returns the mismatches, empty when correct.
 */
const sideMismatches = (tubes: TubeCutPattern[]): string[] => {
	const problems: string[] = [];
	for (const { tube, count, tabs } of midTabs(tubes)) {
		const groups = new Map<string, MidTab[]>();
		for (const t of tabs) {
			const key = `${t.band}:${t.side}`;
			groups.set(key, [...(groups.get(key) ?? []), t]);
		}
		for (const [key, group] of groups) {
			const { band, side } = group[0];
			const labels = group.map((t) => t.label).filter(Boolean);
			const expected = across(tube, band, side, count);
			if (labels.length !== 1 || labels[0] !== expected) {
				problems.push(`t${tube} ${key}: [${labels.join(' ')}] ≠ [${expected}]`);
			}
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
	});

	it("bandEdge 'beforeAndAfter': before tabs name band - 1, after tabs band + 1", () => {
		const tubes = generate({ bandEdge: 'beforeAndAfter' });
		const sides = new Set(midTabs(tubes).flatMap((t) => t.tabs.map((m) => m.side)));
		expect([...sides].sort()).toEqual(['after', 'before']);
		expect(sideMismatches(tubes)).toEqual([]);
	});

	it('wraps: band 0 before names the last band, the last band after names band 0', () => {
		const labelOf = (tubes: TubeCutPattern[], band: number, side: Side) =>
			midTabs(tubes)[0]
				.tabs.filter((t) => t.band === band && t.side === side)
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
					(t) => (t.band === s && t.side === 'after') || (t.band === s + 1 && t.side === 'before')
				);
				const owners = new Set(facing.map((t) => t.band));
				const labels = facing.map((t) => t.label).filter(Boolean);
				const expected = owners.has(s) ? `t${tube}/b${s + 1}` : `t${tube}/b${s}`;
				if (owners.size !== 1 || labels.length !== 1 || labels[0] !== expected) {
					problems.push(`t${tube} seam ${s}: owners ${[...owners]} labels [${labels.join(' ')}]`);
				}
			}
		}
		expect(problems).toEqual([]);
	});
});
