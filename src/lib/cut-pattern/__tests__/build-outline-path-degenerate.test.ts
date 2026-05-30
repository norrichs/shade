// Mock the svelte-dependent chain from generate-outlined-pattern transitive imports:
// generate-cut-pattern.ts → flower-of-life.ts → svg-logger/logger.ts → svelte/store (ESM-only)
// generate-tiled-pattern.ts → generate-pattern.ts → generate-cut-pattern.ts (same chain)
jest.mock('../generate-cut-pattern', () => ({
	getFlatStripV2: jest.fn(),
	getBandBasePoints: jest.fn(),
	applyStrokeWidth: jest.fn()
}));
jest.mock('../generate-tiled-pattern', () => ({
	alignBands: jest.fn(),
	generateTubeCutPattern: jest.fn(),
	applyTubePatternPostProcessing: jest.fn(),
	generateTiledBandPattern: jest.fn()
}));
jest.mock('../generate-panel-pattern', () => ({
	shouldUsePanelPattern: jest.fn(),
	generateProjectionPanelPattern: jest.fn(),
	validateAllPanels: jest.fn(),
	getPanelEdgeMeta: jest.fn(),
	applyHolesToEdgeMeta: jest.fn()
}));

import { Vector3 } from 'three';
import { buildOutlinePath, type OutlineEdge } from '../generate-outlined-pattern';

describe('buildOutlinePath degenerate-edge guard', () => {
	const mk = (start: Vector3, end: Vector3, side: OutlineEdge['side']): OutlineEdge => ({
		start,
		end,
		side,
		interiorPoint: new Vector3(0, 0, 0)
	});

	test('skips zero-length collapsed edges, no duplicate coincident L', () => {
		const C = new Vector3(0, 0, 0);
		// Simulate a fan quad outline: real edge, then a collapsed centroid edge (end == prev pen).
		const edges: OutlineEdge[] = [
			mk(new Vector3(1, 0, 0), new Vector3(0, 1, 0), 'before'),
			mk(new Vector3(0, 1, 0), C, 'end'),
			mk(C, C.clone(), 'after'), // collapsed: start == end == centroid
			mk(C, new Vector3(1, 0, 0), 'end')
		];
		const path = buildOutlinePath(edges);
		// Starts with M, ends with Z
		expect(path[0][0]).toBe('M');
		expect(path[path.length - 1][0]).toBe('Z');
		// No L segment that lands on the immediately-preceding coordinate.
		let prev: [number, number] = [path[0][1] as number, path[0][2] as number];
		for (let i = 1; i < path.length; i++) {
			const seg = path[i];
			if (seg[0] === 'L') {
				const cur: [number, number] = [seg[1] as number, seg[2] as number];
				const dx = cur[0] - prev[0];
				const dy = cur[1] - prev[1];
				expect(dx * dx + dy * dy).toBeGreaterThan(1e-12);
				prev = cur;
			}
		}
	});

	test('non-degenerate edges still emit one L each', () => {
		const edges: OutlineEdge[] = [
			mk(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 'before'),
			mk(new Vector3(1, 0, 0), new Vector3(1, 1, 0), 'end')
		];
		const path = buildOutlinePath(edges);
		const lCount = path.filter((s) => s[0] === 'L').length;
		expect(lCount).toBe(2);
	});
});
