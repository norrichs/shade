import { describe, it, expect, beforeAll } from '@jest/globals';
import { createHash } from 'crypto';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	defaultOutlinedPatternConfig,
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig
} from '$lib/shades-config';
import { runPatternGeneration } from '../run-pattern-generation';
import { resolveTabLabel } from '../resolve-tab-label';
import { buildPatternCsv } from '../build-pattern-csv';
import { buildBandSortIndex } from '../band-sort-index';
import { concatAddress, isGlobuleAddress_BandPiece, isSameParentBand } from '$lib/util';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type {
	BandCutPattern,
	OutlinedPatternConfig,
	PipelineGates,
	SplitConfig,
	TubeCutPattern
} from '$lib/types';

/**
 * Outlined split ends, real wiring (Task 10 fix round 1).
 *
 * Real, unmocked generation on the default superglobule (4-quad bands),
 * outlined with seam tabs on (`splitEnd`). Tube 0 is cut into three pieces of
 * 1, 1 and 2 quads (piece 0 and the last piece differ); its end
 * partners' tubes (6 at 1 → 1/3, 4 at 3 → 3/1) are cut too, so outer ends resolve
 * onto pieces.
 *
 * Oracles are independent of the resolver under test:
 * - a seam end names the adjacent sibling, by piece position alone;
 * - an outer end names the one piece of the partner parent whose OWN outer end
 *   (piece 0's start or the last piece's end) names this band's parent back.
 *   (The resolver instead defaults to the last piece without checking it.)
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};
const splits: SplitConfig = {
	tubeSplits: [
		{ tube: 0, quads: [1, 2] },
		{ tube: 6, quads: [1] },
		{ tube: 4, quads: [3] }
	]
};

type Address = BandCutPattern['address'];
const label = (a: Address | undefined) => (a ? concatAddress(a, 'tb-slash') : '');
const pieceOf = (b: BandCutPattern) =>
	isGlobuleAddress_BandPiece(b.address) ? b.address.piece : 0;

const outlinedConfig = (): OutlinedPatternConfig => {
	const config = defaultOutlinedPatternConfig();
	config.tabConfig = {
		...config.tabConfig!,
		shape: 'rectangle',
		bandEdge: 'beforeAndAfter',
		bandEnd: 'beforeAndAfter',
		splitEnd: 'after'
	};
	return config;
};

/** Split a CSV row on top-level commas; unquote cells. */
const cells = (row: string): string[] =>
	(row.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [])
		.map((c) => c.replace(/,$/, ''))
		.map((c) => (c.startsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c))
		.slice(0, 3);

let tubes: TubeCutPattern[];

beforeAll(() => {
	const superConfig = generateDefaultSuperGlobuleConfig();
	const superGlobule = generateSuperGlobule(superConfig, gates);
	const genConfig: PatternGenerationConfig = {
		patternTypeConfig: outlinedConfig(),
		pixelScale: generateDefaultGlobulePatternConfig().patternConfig.pixelScale,
		showBands: true,
		range: { tubes: undefined, bands: undefined, facets: undefined },
		patternSource: 'projection',
		splits
	};
	const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });
	const pattern = result.projectionPattern as SuperGlobuleProjectionCutPattern;
	expect(pattern.rejectedSplits ?? []).toEqual([]);
	tubes = pattern.projectionCutPattern.tubes;
});

const piecesOfParent = (a: Address) =>
	tubes
		.flatMap((t) => t.bands)
		.filter((b) => isSameParentBand(b.address, a))
		.sort((x, y) => pieceOf(x) - pieceOf(y));

/** The expected physical part at `band`'s `end`, or undefined to skip (ambiguous). */
const expectedEnd = (
	band: BandCutPattern,
	end: 'start' | 'end'
):
	| { address: Address | undefined; kind: 'seam' | 'outer-piece' | 'outer-plain' | 'none' }
	| undefined => {
	const own = piecesOfParent(band.address);
	const k = own.indexOf(band);
	if (own.length > 1 && end === 'start' && k > 0)
		return { address: own[k - 1].address, kind: 'seam' };
	if (own.length > 1 && end === 'end' && k < own.length - 1)
		return { address: own[k + 1].address, kind: 'seam' };
	// Outer end: read the GEOMETRY partner from the parent's own outer end.
	const outerOwner = end === 'start' ? own[0] : own[own.length - 1];
	const stored =
		end === 'start' ? outerOwner.meta?.startPartnerBand : outerOwner.meta?.endPartnerBand;
	if (!stored) return { address: undefined, kind: 'none' };
	const parts = piecesOfParent(stored);
	if (parts.length === 1) return { address: parts[0].address, kind: 'outer-plain' };
	const candidates = [
		parts[0].meta?.startPartnerBand &&
		isSameParentBand(parts[0].meta.startPartnerBand, band.address)
			? parts[0]
			: undefined,
		parts[parts.length - 1].meta?.endPartnerBand &&
		isSameParentBand(parts[parts.length - 1].meta!.endPartnerBand!, band.address)
			? parts[parts.length - 1]
			: undefined
	].filter((b) => b !== undefined);
	return candidates.length === 1
		? { address: candidates[0].address, kind: 'outer-piece' }
		: undefined;
};

describe('outlined split — end labels and CSV name the physical piece (real wiring)', () => {
	it('every seam end names its adjacent sibling; every outer end names the joining piece', () => {
		const csv = buildPatternCsv(buildBandSortIndex(tubes, 'tube-order'), tubes).split('\n');
		const rowFor = new Map(csv.slice(1).map((r) => [cells(r)[0], cells(r)]));
		const kinds: Record<string, number> = {};
		const mismatches: string[] = [];
		for (const tubeIndex of [0, 4, 6]) {
			const tube = tubes[tubeIndex];
			for (const band of tube.bands) {
				const expectedCell: string[] = [];
				for (const end of ['start', 'end'] as const) {
					const expected = expectedEnd(band, end);
					if (!expected) continue;
					kinds[expected.kind] = (kinds[expected.kind] ?? 0) + 1;
					const got = resolveTabLabel(
						{
							outer: [],
							base: [
								{ x: 0, y: 0 },
								{ x: 0, y: 0 }
							],
							position: end
						},
						band,
						tube,
						tubes
					);
					if (got !== label(expected.address)) {
						mismatches.push(`${label(band.address)} ${end}: ${got} ≠ ${label(expected.address)}`);
					}
					const text = label(expected.address);
					if (text && !expectedCell.includes(text)) expectedCell.push(text);
				}
				const row = rowFor.get(label(band.address));
				if (row?.[2] !== expectedCell.join(' ')) {
					mismatches.push(`csv ${label(band.address)}: ${row?.[2]} ≠ ${expectedCell.join(' ')}`);
				}
			}
		}
		expect(mismatches).toEqual([]);
		// Six bands per tube: tube 0's three pieces give 4 seam ends a band (24);
		// tubes 4 and 6 give 2 a band (12 each).
		expect(kinds.seam).toBe(48);
		expect(kinds['outer-piece']).toBeGreaterThan(0);
	});

	it('stamps quadCount on every band of a split tube, and on no band of an unsplit one', () => {
		for (const t of [0, 4, 6]) {
			for (const band of tubes[t].bands) {
				expect(band.quadCount).toBe(band.facets.filter((f) => f.quad).length);
			}
		}
		expect(tubes[0].bands.map((b) => b.quadCount)).toEqual(
			Array.from({ length: 6 }, () => [1, 1, 2]).flat()
		);
		expect(tubes[1].bands.every((b) => !('quadCount' in b))).toBe(true);
	});

	it('GUARD: seam and cap tab allocation is unchanged by partner meta', () => {
		const allocation = tubes.map((t) =>
			t.bands
				.map((b) => `${label(b.address)}:${(b.tabs ?? []).map((tab) => tab.position[0]).join('')}`)
				.join(' ')
		);
		expect(allocation[0]).toBe(TUBE0_ALLOCATION);
		expect(createHash('sha256').update(allocation.join('\n')).digest('hex').slice(0, 16)).toBe(
			ALLOCATION_SHA
		);
	});
});

// Recorded before outlined meta stored seam siblings (fix round 1).
const TUBE0_ALLOCATION =
	't0/b0p0:mems t0/b0p1:mem t0/b0p2:mmemm t0/b1p0:mems t0/b1p1:mem t0/b1p2:mmemm t0/b2p0:mems t0/b2p1:mem t0/b2p2:mmemm t0/b3p0:mems t0/b3p1:mem t0/b3p2:mmemm t0/b4p0:mems t0/b4p1:mem t0/b4p2:mmemm t0/b5p0:mems t0/b5p1:mem t0/b5p2:mmemm';
const ALLOCATION_SHA = '88adef7ec65b6829';
