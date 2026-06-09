import { Vector2 } from 'three';
import { buildCellCurvedInsets2d, vertexKey, type CurvedCellEdge } from '../curved-inset-2d';

// A unit square cell centered on the seed at the origin.
//   P0=(1,1)  P1=(-1,1)  P2=(-1,-1)  P3=(1,-1)
// Edges (closed ring): E0 P0-P1, E1 P1-P2, E2 P2-P3, E3 P3-P0.
function squareCell(sampleCount: number) {
	const P0 = new Vector2(1, 1);
	const P1 = new Vector2(-1, 1);
	const P2 = new Vector2(-1, -1);
	const P3 = new Vector2(1, -1);
	const k = (p: Vector2) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
	const vertexPos2d = new Map<string, Vector2>([
		[k(P0), P0],
		[k(P1), P1],
		[k(P2), P2],
		[k(P3), P3]
	]);
	const edges: CurvedCellEdge[] = [
		{ edgeId: 0, vKeyStart: k(P0), vKeyEnd: k(P1), sampleCount },
		{ edgeId: 1, vKeyStart: k(P1), vKeyEnd: k(P2), sampleCount },
		{ edgeId: 2, vKeyStart: k(P2), vKeyEnd: k(P3), sampleCount },
		{ edgeId: 3, vKeyStart: k(P3), vKeyEnd: k(P0), sampleCount }
	];
	return { edges, vertexPos2d, seed2d: new Vector2(0, 0), curveOffsetFactor: 0.25 };
}

describe('buildCellCurvedInsets2d', () => {
	it('produces sampleCount points per edge of a closed cell', () => {
		const out = buildCellCurvedInsets2d(squareCell(3));
		for (let e = 0; e < 4; e++) {
			const pts = out.get(e);
			expect(pts).not.toBeNull();
			expect(pts as Vector2[]).toHaveLength(3);
		}
	});

	it('for sampleCount=3 the middle sample is the inset-edge midpoint', () => {
		const out = buildCellCurvedInsets2d(squareCell(3));
		// E0 spans P0=(1,1) -> P1=(-1,1); inset toward origin by 0.25:
		// P0'=(0.75,0.75), P1'=(-0.75,0.75); midpoint = (0, 0.75).
		const e0 = out.get(0) as Vector2[];
		expect(e0[1].x).toBeCloseTo(0, 6);
		expect(e0[1].y).toBeCloseTo(0.75, 6);
	});

	it('endpoints of an inner curve lie on the vertex->seed lines', () => {
		const out = buildCellCurvedInsets2d(squareCell(3));
		const e0 = out.get(0) as Vector2[];
		// Start endpoint on line P0=(1,1)..seed=(0,0): y = x.
		expect(e0[0].x - e0[0].y).toBeCloseTo(0, 6);
		// End endpoint on line P1=(-1,1)..seed=(0,0): y = -x  => x + y = 0.
		const last = e0[e0.length - 1];
		expect(last.x + last.y).toBeCloseTo(0, 6);
	});

	it('produces sampleCount points for higher divisions (sampleCount=4)', () => {
		const out = buildCellCurvedInsets2d(squareCell(4));
		const e0 = out.get(0) as Vector2[];
		expect(e0).toHaveLength(4);
		// Endpoints still on the vertex->seed lines.
		expect(e0[0].x - e0[0].y).toBeCloseTo(0, 6);
		expect(e0[3].x + e0[3].y).toBeCloseTo(0, 6);
	});

	it('falls back (null) for edges of an open chain whose vertex has degree 1', () => {
		// Open chain: just E0 (P0-P1) and E1 (P1-P2). P0 and P2 have degree 1.
		const P0 = new Vector2(1, 1);
		const P1 = new Vector2(-1, 1);
		const P2 = new Vector2(-1, -1);
		const k = (p: Vector2) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
		const out = buildCellCurvedInsets2d({
			edges: [
				{ edgeId: 0, vKeyStart: k(P0), vKeyEnd: k(P1), sampleCount: 3 },
				{ edgeId: 1, vKeyStart: k(P1), vKeyEnd: k(P2), sampleCount: 3 }
			],
			vertexPos2d: new Map([
				[k(P0), P0],
				[k(P1), P1],
				[k(P2), P2]
			]),
			seed2d: new Vector2(0, 0),
			curveOffsetFactor: 0.25
		});
		// Both edges touch a degree-1 vertex, so both fall back.
		expect(out.get(0)).toBeNull();
		expect(out.get(1)).toBeNull();
	});

	it('vertexKey is stable for equal coordinates', () => {
		expect(vertexKey([1.0, -0.3])).toBe(vertexKey([1.0, -0.3]));
		expect(vertexKey([1.0, -0.3])).not.toBe(vertexKey([1.0, 0.3]));
	});
});
