/**
 * Render a tiled pattern's adjusted bands to SVG, to compare against Ben's
 * design screenshots before he looks at the app.
 *
 * Copy to src/lib/patterns/__render__/render-bands.test.ts (jest only runs
 * tests under src), run, then delete the copy — it is never committed:
 *
 *   PATTERN=tiledHexparquet2Pattern-0 OUT=$CLAUDE_JOB_DIR/tmp \
 *     yarn jest src/lib/patterns/__render__/render-bands.test.ts
 *   rsvg-convert -z 1.5 $OUT/wrapping-joined.svg -o $OUT/wrapping-joined.png
 *
 * Optional env: QUADS (per band, default 2 × subunitCount), ASPECT (quad
 * width / height, default √3 for 30° diagonals), KEEP_SEAM (default the
 * pattern's tiledPatternConfigs value), COLUMNS (default 1).
 *
 * Writes, for a 3-band wrapping tube and a 3-band open tube:
 *   *-apart.svg   bands spread out: each band's own cut piece (stroke union)
 *   *-joined.svg  bands at their true positions: seams must interlock with no
 *                 overlap except shared seam lines
 * Facet 0 is drawn at the BOTTOM, matching the design images (unit y = 1 up).
 */
import { writeFileSync } from 'fs';
import { Vector3 } from 'three';
import type {
	BandCutPattern,
	PathSegment,
	Quadrilateral,
	TiledPatternConfig,
	TubeCutPattern
} from '#lib/types.js';
import { transformPatternByQuad } from '#lib/patterns/quadrilateral.js';
import { patterns } from '#lib/patterns/pattern-definitions.js';
import { tiledPatternConfigs } from '#lib/shades-config.js';
import { buildBandUnionPath } from '#lib/cut-pattern/build-band-union-path.js';

const TYPE = process.env.PATTERN as string;
const OUT = process.env.OUT as string;
const entry = patterns[TYPE];
const subunitCount = entry.subunitCount ?? 1;
const QUADS = Number(process.env.QUADS ?? 2 * subunitCount);
const COLUMNS = Number(process.env.COLUMNS ?? 1);
const H = 60;
const W = H * Number(process.env.ASPECT ?? Math.sqrt(3));

const base = tiledPatternConfigs[TYPE] as TiledPatternConfig;
const config: TiledPatternConfig = {
	...base,
	config: {
		...base.config,
		columnCount: COLUMNS,
		...(process.env.KEEP_SEAM ? { keepPartnerSeam: process.env.KEEP_SEAM === 'true' } : {})
	}
};

const quads = (band: number): Quadrilateral[] =>
	Array.from({ length: QUADS }, (_, i) => ({
		a: new Vector3(band * W, (QUADS - i) * H, 0),
		b: new Vector3((band + 1) * W, (QUADS - i) * H, 0),
		c: new Vector3((band + 1) * W, (QUADS - i - 1) * H, 0),
		d: new Vector3(band * W, (QUADS - i - 1) * H, 0)
	}));

const unitPatterns = (): PathSegment[][] =>
	entry.getSubunitPatterns?.(COLUMNS) ?? [entry.getPattern(1, COLUMNS)];

const band = (index: number, leftPartnerBand?: number): BandCutPattern => {
	const subunits = unitPatterns();
	return {
		id: `b${index}`,
		projectionType: 'patterned',
		tagAnchorPoint: { x: 0, y: 0 },
		address: { globule: 0, tube: 0, band: index },
		leftPartnerBand,
		facets: quads(index).map((quad, i) => ({
			path: transformPatternByQuad(subunits[i % subunits.length], quad),
			quad,
			label: `${i}`,
			strokeWidth: 2
		}))
	} as BandCutPattern;
};

const d = (path: PathSegment[]) => path.map((s) => s.join(' ')).join(' ');
const COLORS = ['#c9a0dc', '#9ec5e8', '#f0a8b8'];

const render = (bands: BandCutPattern[], name: string, spread: number) => {
	const tubes = [{ bands }] as unknown as TubeCutPattern[];
	const adjusted = entry.adjustAfterTiling ? entry.adjustAfterTiling(bands, config, tubes) : bands;
	const groups = adjusted.map((b, i) => {
		const quadOutlines = bands[i].facets
			.map(({ quad }) => {
				const { a, b: qb, c, d: qd } = quad as Quadrilateral;
				return `<path d="M ${a.x} ${a.y} L ${qb.x} ${qb.y} L ${c.x} ${c.y} L ${qd.x} ${qd.y} Z" fill="none" stroke="#999" stroke-width="0.6"/>`;
			})
			.join('');
		const union = d(buildBandUnionPath(b));
		return `<g transform="translate(${i * spread + 80},40)">${quadOutlines}<path d="${union}" fill="${COLORS[i % 3]}" fill-opacity="0.8" fill-rule="evenodd" stroke="#222" stroke-width="0.6"/></g>`;
	});
	const width = bands.length * (W + spread) + 160;
	const height = QUADS * H + 80;
	writeFileSync(
		`${OUT}/${name}.svg`,
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/>${groups.join('')}</svg>`
	);
};

it(`renders ${TYPE}`, () => {
	const wrapping = () => [0, 1, 2].map((b) => band(b, (b + 2) % 3));
	const open = () => [0, 1, 2].map((b) => band(b, b > 0 ? b - 1 : undefined));
	render(wrapping(), 'wrapping-apart', 60);
	render(wrapping(), 'wrapping-joined', 0);
	render(open(), 'open-apart', 60);
});
