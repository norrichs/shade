import { describe, it, expect } from '@jest/globals';
import { generateSuperGlobule } from '#lib/generate-superglobule.js';
import { generateProjectionPattern } from '../generate-pattern';
import {
	generateDefaultSuperGlobuleConfig,
	generateDefaultGlobulePatternConfig,
	tiledPatternConfigs
} from '#lib/shades-config.js';
import type { SuperGlobuleProjectionCutPattern } from '#lib/stores/superGlobuleStores.js';
import type { BandCutPattern } from '#lib/types.js';

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

	it("lands gained lines on the band's own nodes: only the right zigzag's two end corners are loose", () => {
		// The right outline (5,1)→(6,2) at the start and (5,1)→(6,0) at the end stops on the band's edge.
		expect(bands.map(looseEnds)).toEqual(bands.map(() => 2));
	});
});
