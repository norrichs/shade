import { Vector3 } from 'three';
import type { PathSegment, Quadrilateral, TiledPatternConfig } from '$lib/types';
import { transformPatternByQuad } from '../quadrilateral';
import {
	adjustAsanohaPatternAfterMapping,
	generateAsanohaPattern,
	getAsanohaSegments
} from '../tiled-asanoha-pattern';

// Consecutive quads share an edge exactly like real flattened bands:
// quad[i+1].a === quad[i].d and quad[i+1].b === quad[i].c. A slight skew keeps
// the coordinates non-trivial.
const makeQuadBand = (count: number): Quadrilateral[] =>
	Array.from({ length: count }, (_, i) => ({
		a: new Vector3(i * 0.3, i * 10, 0),
		b: new Vector3(17 + i * 0.3, i * 10 + 0.5, 0),
		c: new Vector3(17 + (i + 1) * 0.3, (i + 1) * 10 + 0.5, 0),
		d: new Vector3((i + 1) * 0.3, (i + 1) * 10, 0)
	}));

const makeConfig = (overrides: Partial<TiledPatternConfig['config']>): TiledPatternConfig => ({
	type: 'tiledAsanohaPattern-1',
	tiling: 'quadrilateral',
	config: {
		rowCount: 1,
		columnCount: 1,
		dynamicStroke: 'quadWidth',
		dynamicStrokeEasing: 'linear',
		dynamicStrokeMin: 1,
		dynamicStrokeMax: 3,
		endsMatched: false,
		endsTrimmed: false,
		endLooped: 0,
		scaleConfig: { unit: 'px', unitPerSvgUnit: 1, quantity: 1 },
		...overrides
	}
});

// Round so the snapshot is insensitive to harmless floating-point reordering.
const round = (band: PathSegment[][]) =>
	band.map((facet) =>
		facet.map((seg) => seg.map((v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)))
	);

describe('asanoha adjustAfterMapping (characterization)', () => {
	for (const rows of [1, 2]) {
		for (const columns of [1, 2]) {
			for (const hasOuterMirror of [false, true]) {
				for (const endsMatched of [false, true]) {
					for (const endsTrimmed of [false, true]) {
						it(`rows=${rows} columns=${columns} mirror=${hasOuterMirror} matched=${endsMatched} trimmed=${endsTrimmed}`, () => {
							const quadBand = makeQuadBand(4);
							const unit = generateAsanohaPattern({
								size: 1,
								rows,
								columns,
								finishOuterEdge: hasOuterMirror
							});
							const mapped = quadBand.map((quad) => transformPatternByQuad(unit, quad));
							const result = adjustAsanohaPatternAfterMapping(
								mapped,
								quadBand,
								makeConfig({ rowCount: rows, columnCount: columns, endsMatched, endsTrimmed }),
								getAsanohaSegments,
								hasOuterMirror
							);
							expect(round(result)).toMatchSnapshot();
						});
					}
				}
			}
		}
	}

	it('snaps each facet start node onto the previous facet end node', () => {
		const quadBand = makeQuadBand(3);
		const unit = generateAsanohaPattern({ size: 1, rows: 1, columns: 1 });
		const mapped = quadBand.map((quad) => transformPatternByQuad(unit, quad));
		const result = adjustAsanohaPatternAfterMapping(
			mapped,
			quadBand,
			makeConfig({}),
			getAsanohaSegments,
			false
		);
		const [[startM]] = getAsanohaSegments('start', 1, 1, mapped[1].length);
		const [[endM]] = getAsanohaSegments('end', 1, 1, mapped[0].length);
		expect(result[1][startM][1]).toBeCloseTo(mapped[0][endM][1] as number);
		expect(result[1][startM][2]).toBeCloseTo(mapped[0][endM][2] as number);
	});
});
