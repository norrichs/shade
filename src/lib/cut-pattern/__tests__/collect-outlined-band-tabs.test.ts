import { Vector3 } from 'three';
import {
	collectOutlinedBandTabs,
	type OutlinedTabEdge
} from '../collect-outlined-band-tabs';
import type { TabGeometry } from '../generate-tab-geometry';

// Helpers --------------------------------------------------------------------

// Build a simple rectangular tab footprint (edgeStart→outerStart→outerEnd→edgeEnd).
const rectTab = (
	edgeStart: [number, number],
	edgeEnd: [number, number],
	outerStart: [number, number],
	outerEnd: [number, number]
): TabGeometry => ({
	edgeStart: new Vector3(edgeStart[0], edgeStart[1], 0),
	edgeEnd: new Vector3(edgeEnd[0], edgeEnd[1], 0),
	path: [
		['L', outerStart[0], outerStart[1]],
		['L', outerEnd[0], outerEnd[1]],
		['L', edgeEnd[0], edgeEnd[1]]
	]
});

const endEdge = (endIsStartCap: boolean): OutlinedTabEdge => ({
	side: 'end',
	endIsStartCap
});
const beforeEdge = (): OutlinedTabEdge => ({ side: 'before' });
const afterEdge = (): OutlinedTabEdge => ({ side: 'after' });

// Tests ----------------------------------------------------------------------

describe('collectOutlinedBandTabs', () => {
	it('returns undefined when no tabs are present', () => {
		const edges: OutlinedTabEdge[] = [beforeEdge(), endEdge(false), afterEdge(), endEdge(true)];
		const result = collectOutlinedBandTabs(edges, new Map());
		expect(result).toBeUndefined();
	});

	it('classifies a near-end (endIsStartCap=true) tab as start', () => {
		const edges: OutlinedTabEdge[] = [endEdge(true)];
		const tabs = new Map<number, TabGeometry>([
			[0, rectTab([0, 0], [1, 0], [0, 1], [1, 1])]
		]);

		const result = collectOutlinedBandTabs(edges, tabs);
		expect(result).toBeDefined();
		expect(result!.length).toBe(1);
		expect(result![0].position).toBe('start');
		expect(result![0].midIndex).toBeUndefined();
		expect(result![0].midCount).toBeUndefined();
	});

	it('classifies a far-end (endIsStartCap=false) tab as end', () => {
		const edges: OutlinedTabEdge[] = [endEdge(false)];
		const tabs = new Map<number, TabGeometry>([
			[0, rectTab([0, 0], [1, 0], [0, 1], [1, 1])]
		]);

		const result = collectOutlinedBandTabs(edges, tabs);
		expect(result).toBeDefined();
		expect(result![0].position).toBe('end');
	});

	it('classifies before/after edge tabs as mid and assigns midIndex/midCount', () => {
		// Walk order mirrors getOutlineEdges:
		//   beforeEdges (0,1,2) → farEnd (3) → afterEdges (4,5,6) → nearEnd (7)
		// Three mid tabs and both end caps tabbed; expect:
		//   index 0..2 (before tabs) → mid 0,1,2
		//   index 3 (far end)        → end
		//   index 4..6 (after tabs)  → mid 3,4,5
		//   index 7 (near end)       → start
		const edges: OutlinedTabEdge[] = [
			beforeEdge(),
			beforeEdge(),
			beforeEdge(),
			endEdge(false),
			afterEdge(),
			afterEdge(),
			afterEdge(),
			endEdge(true)
		];

		const mkTab = (i: number): TabGeometry =>
			rectTab([i, 0], [i + 1, 0], [i, 1], [i + 1, 1]);
		const tabs = new Map<number, TabGeometry>();
		for (let i = 0; i < edges.length; i++) tabs.set(i, mkTab(i));

		const result = collectOutlinedBandTabs(edges, tabs);
		expect(result).toBeDefined();
		expect(result!.length).toBe(8);

		const positions = result!.map((r) => r.position);
		expect(positions).toEqual([
			'mid',
			'mid',
			'mid',
			'end',
			'mid',
			'mid',
			'mid',
			'start'
		]);

		const midRecords = result!.filter((r) => r.position === 'mid');
		expect(midRecords.length).toBe(6);
		// midIndex assigned in encounter order across all mid edges
		expect(midRecords.map((r) => r.midIndex)).toEqual([0, 1, 2, 3, 4, 5]);
		// midCount back-filled to total mid count on every mid record
		expect(midRecords.every((r) => r.midCount === 6)).toBe(true);

		// Cap records have no midIndex/midCount.
		const startRecord = result!.find((r) => r.position === 'start')!;
		const endRecord = result!.find((r) => r.position === 'end')!;
		expect(startRecord.midIndex).toBeUndefined();
		expect(startRecord.midCount).toBeUndefined();
		expect(endRecord.midIndex).toBeUndefined();
		expect(endRecord.midCount).toBeUndefined();
	});

	it('matches the task spec: 1 start + 1 end + 3 mids → midIndex 0,1,2 midCount 3', () => {
		// Spec scenario: a band with both startPartnerBand and endPartnerBand and
		// 3 mid edges; expect 1 start + 1 end + 3 mids with midIndex 0,1,2 and
		// midCount=3.
		const edges: OutlinedTabEdge[] = [
			beforeEdge(),
			endEdge(false),
			afterEdge(),
			afterEdge(),
			endEdge(true)
		];
		const tabs = new Map<number, TabGeometry>();
		for (let i = 0; i < edges.length; i++) {
			tabs.set(i, rectTab([i, 0], [i + 1, 0], [i, 1], [i + 1, 1]));
		}

		const result = collectOutlinedBandTabs(edges, tabs);
		expect(result).toBeDefined();

		const byPosition = result!.reduce<Record<string, number>>((acc, r) => {
			acc[r.position] = (acc[r.position] ?? 0) + 1;
			return acc;
		}, {});
		expect(byPosition).toEqual({ start: 1, end: 1, mid: 3 });

		const mids = result!.filter((r) => r.position === 'mid');
		expect(mids.map((r) => r.midIndex)).toEqual([0, 1, 2]);
		expect(mids.every((r) => r.midCount === 3)).toBe(true);
	});

	it('outputs 2D Points only (no Vector3 leaks) for outer + base', () => {
		const edges: OutlinedTabEdge[] = [endEdge(true)];
		const tabs = new Map<number, TabGeometry>([
			[0, rectTab([0, 0], [4, 0], [0, 2], [4, 2])]
		]);

		const result = collectOutlinedBandTabs(edges, tabs)!;
		const record = result[0];

		// outer: should be plain {x,y} objects, no Vector3 methods.
		for (const p of record.outer) {
			expect(typeof p.x).toBe('number');
			expect(typeof p.y).toBe('number');
			expect((p as unknown as { isVector3?: boolean }).isVector3).toBeUndefined();
			// Plain object: no .clone(), no .add()
			expect((p as unknown as { clone?: unknown }).clone).toBeUndefined();
		}

		// base: 2-tuple of plain Points
		expect(record.base.length).toBe(2);
		for (const p of record.base) {
			expect(typeof p.x).toBe('number');
			expect(typeof p.y).toBe('number');
			expect((p as unknown as { isVector3?: boolean }).isVector3).toBeUndefined();
		}
		expect(record.base[0]).toEqual({ x: 0, y: 0 });
		expect(record.base[1]).toEqual({ x: 4, y: 0 });
	});

	it('outer ring traces the full tab polygon for a rectangular tab', () => {
		// Rectangle: shared edge (0,0)→(4,0), outer (0,2)→(4,2).
		// Expected polygon walk: edgeStart, outerStart, outerEnd, edgeEnd.
		const edges: OutlinedTabEdge[] = [endEdge(true)];
		const tabs = new Map<number, TabGeometry>([
			[0, rectTab([0, 0], [4, 0], [0, 2], [4, 2])]
		]);

		const result = collectOutlinedBandTabs(edges, tabs)!;
		expect(result[0].outer).toEqual([
			{ x: 0, y: 0 },
			{ x: 0, y: 2 },
			{ x: 4, y: 2 },
			{ x: 4, y: 0 }
		]);
	});

	it('outer ring picks up arc endpoints for rounded tab paths', () => {
		// Synthesize a rounded-style path: L → A → L → A → L. We only care that
		// the arc *endpoints* (the last two args of each A) are captured.
		const tab: TabGeometry = {
			edgeStart: new Vector3(0, 0, 0),
			edgeEnd: new Vector3(10, 0, 0),
			path: [
				['L', 0, 1],
				['A', 1, 1, 0, 0, 0, 1, 2],
				['L', 9, 2],
				['A', 1, 1, 0, 0, 0, 10, 1],
				['L', 10, 0]
			]
		};
		const edges: OutlinedTabEdge[] = [endEdge(false)];
		const tabs = new Map<number, TabGeometry>([[0, tab]]);

		const result = collectOutlinedBandTabs(edges, tabs)!;
		// Walk: edgeStart, L(0,1), A→(1,2), L(9,2), A→(10,1), L(10,0)=edgeEnd dedup.
		expect(result[0].outer).toEqual([
			{ x: 0, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 2 },
			{ x: 9, y: 2 },
			{ x: 10, y: 1 },
			{ x: 10, y: 0 }
		]);
	});

	it('skips edges that have no tab entry, even if listed', () => {
		const edges: OutlinedTabEdge[] = [
			endEdge(true),
			beforeEdge(),
			endEdge(false)
		];
		// Only the two end caps have tabs.
		const tabs = new Map<number, TabGeometry>([
			[0, rectTab([0, 0], [1, 0], [0, 1], [1, 1])],
			[2, rectTab([2, 0], [3, 0], [2, 1], [3, 1])]
		]);

		const result = collectOutlinedBandTabs(edges, tabs)!;
		expect(result.length).toBe(2);
		expect(result[0].position).toBe('start');
		expect(result[1].position).toBe('end');
	});
});
