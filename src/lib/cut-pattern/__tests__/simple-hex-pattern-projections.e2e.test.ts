import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '#lib/generate-superglobule.js';
import { generateProjectionPattern } from '../generate-pattern';
import { runPatternGeneration } from '../run-pattern-generation';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '#lib/shades-config.js';
import type { SuperGlobuleProjectionCutPattern } from '#lib/stores/superGlobuleStores.js';
import type { BandCutPattern, EndTermination, TubeCutPattern } from '#lib/types.js';
import { resolveEndPartner } from '../resolve-partner-band';

type Line = [number, number, number, number];

const distanceToLine = (px: number, py: number, [x0, y0, x1, y1]: Line) => {
	const [dx, dy] = [x1 - x0, y1 - y0];
	const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1)));
	return Math.hypot(x0 + t * dx - px, y0 + t * dy - py);
};

/** Line ends that touch no other line of the band (within 1e-3 px; T-junctions touch). */
const looseEnds = (band: BandCutPattern) => {
	const lines: Line[] = band.facets.flatMap(({ path }) =>
		path.flatMap((seg, i) =>
			i % 2 === 0 ? [[seg[1], seg[2], path[i + 1][1], path[i + 1][2]] as Line] : []
		)
	);
	return lines.flatMap((line, k) =>
		[
			[line[0], line[1]],
			[line[2], line[3]]
		].filter(([px, py]) =>
			lines.every((other, j) => j === k || distanceToLine(px, py, other) > 1e-3)
		)
	).length;
};

/** The band's label anchor is an endpoint of one of its first facet's lines (within 1e-6 px). */
const anchoredOnNode = (band: BandCutPattern) =>
	band.facets[0].path.some(
		(seg) =>
			Math.hypot(
				(seg[1] as number) - band.tagAnchorPoint.x,
				(seg[2] as number) - band.tagAnchorPoint.y
			) < 1e-6
	);

describe('SimpleHex end to end (projections, real geometry)', () => {
	// The default edge curve gives 4 quads per band: two units of 2 subunits.
	const superGlobule = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), {
		globuleTube: false,
		projection: true,
		voronoi: false
	});
	const patternConfig = generateDefaultGlobulePatternConfig();
	patternConfig.patternTypeConfig = { ...tiledPatternConfigs['tiledSimpleHexPattern-0'] };
	patternConfig.patternViewConfig.range = { tubes: undefined, bands: undefined };
	const pattern = generateProjectionPattern(
		superGlobule.projections[0].tubes,
		'super-1',
		patternConfig,
		patternConfig.patternViewConfig.range
	) as SuperGlobuleProjectionCutPattern;
	const bands = pattern.projectionCutPattern.tubes.flatMap((t) => t.bands);

	it('patterns every band with finite coordinates, partners included', () => {
		expect(bands.length).toBeGreaterThan(0);
		expect(bands.every((b) => !b.error && b.facets.length === 4)).toBe(true);
		const coords = bands.flatMap((b) =>
			b.facets.flatMap((f) => f.path.flatMap((seg) => seg.slice(1) as number[]))
		);
		expect(coords.every(Number.isFinite)).toBe(true);
		expect(bands.filter((b) => b.leftPartnerBand !== undefined).length).toBeGreaterThan(0);
	});

	it("lands gained lines on the band's own nodes, leaving no loose ends (smoothed ends)", () => {
		// Smoothed ends join the right outline's end corners to the closed hexagons.
		expect(bands.map(looseEnds)).toEqual(bands.map(() => 0));
	});

	it('anchors every label on a real node', () => {
		expect(bands.map(anchoredOnNode)).toEqual(bands.map(() => true));
	});
});

describe('SimpleHex end to end at a split (projections, real geometry)', () => {
	const gates = { globuleTube: false, projection: true, voronoi: false };
	const superConfig = generateDefaultSuperGlobuleConfig();
	const superGlobule = generateSuperGlobule(superConfig, gates);
	const patternConfig = generateDefaultGlobulePatternConfig();
	const result = runPatternGeneration({
		superGlobule,
		superConfig,
		genConfig: {
			patternTypeConfig: { ...tiledPatternConfigs['tiledSimpleHexPattern-0'] },
			pixelScale: patternConfig.patternConfig.pixelScale,
			showBands: true,
			range: { tubes: undefined, bands: undefined, facets: undefined },
			patternSource: 'projection',
			splits: { tubeSplits: [{ tube: 0, quads: [2] }] }
		},
		gates
	});
	const pieces = (result.projectionPattern as SuperGlobuleProjectionCutPattern).projectionCutPattern
		.tubes[0].bands;

	it('splits every band of the tube into two pieces of 2 quads', () => {
		expect(pieces.length).toBeGreaterThan(0);
		expect(pieces.every((b) => !b.error && b.facets.length === 2)).toBe(true);
		expect(new Set(pieces.map((b) => (b.address as { piece?: number }).piece))).toEqual(
			new Set([0, 1])
		);
	});

	it('joins the split cleanly, leaving no loose ends', () => {
		expect(pieces.map(looseEnds)).toEqual(pieces.map(() => 0));
	});

	it('anchors every piece’s label on a real node', () => {
		expect(pieces.map(anchoredOnNode)).toEqual(pieces.map(() => true));
	});
});

describe('SimpleHex end to end, extended ends (projections, real geometry)', () => {
	const superGlobule = generateSuperGlobule(generateDefaultSuperGlobuleConfig(), {
		globuleTube: false,
		projection: true,
		voronoi: false
	});
	const run = (endTermination: EndTermination) => {
		const patternConfig = generateDefaultGlobulePatternConfig();
		const base = tiledPatternConfigs['tiledSimpleHexPattern-0'];
		patternConfig.patternTypeConfig = { ...base, config: { ...base.config, endTermination } };
		patternConfig.patternViewConfig.range = { tubes: undefined, bands: undefined };
		return (
			generateProjectionPattern(
				superGlobule.projections[0].tubes,
				'super-1',
				patternConfig,
				patternConfig.patternViewConfig.range
			) as SuperGlobuleProjectionCutPattern
		).projectionCutPattern.tubes;
	};
	const extended = run('extended');
	const natural = run('natural');
	const bandsOf = (tubes: TubeCutPattern[]) => tubes.flatMap((t) => t.bands);
	const lineCount = (band: BandCutPattern, end: 'start' | 'end') =>
		(end === 'start' ? band.facets[0] : band.facets[band.facets.length - 1]).path.length / 2;
	/** An end extends when it has more lines than under `natural`, where every spur is dropped. */
	const extendsAt = (band: BandCutPattern, end: 'start' | 'end') => {
		const plain = natural[band.address.tube].bands.find((b) => b.id === band.id) as BandCutPattern;
		return lineCount(band, end) > lineCount(plain, end);
	};

	it('leaves no loose ends', () => {
		expect(bandsOf(extended).map(looseEnds)).toEqual(bandsOf(extended).map(() => 0));
	});

	it('anchors every label on a real node', () => {
		expect(bandsOf(extended).map(anchoredOnNode)).toEqual(bandsOf(extended).map(() => true));
	});

	it('extends exactly one end of every partner pair', () => {
		let pairs = 0;
		for (const band of bandsOf(extended))
			for (const end of ['start', 'end'] as const) {
				const partner = resolveEndPartner(extended, band, end);
				if (!partner || partner.band.error) continue;
				pairs++;
				expect(extendsAt(band, end)).not.toBe(extendsAt(partner.band, partner.partnerEnd));
			}
		expect(pairs).toBeGreaterThan(0);
	});
});
