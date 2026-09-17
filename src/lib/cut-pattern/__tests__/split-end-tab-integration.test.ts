// Mock the svelte-dependent chain from generate-outlined-pattern transitive imports:
// generate-cut-pattern.ts → flower-of-life.ts → svg-logger/logger.ts → svelte/store (ESM-only)
// generate-tiled-pattern.ts → generate-pattern.ts → generate-cut-pattern.ts (same chain)
// See build-outline-path-degenerate.test.ts for the same mocking, needed for the
// same reason: none of these are exercised by generateOutlinedBandPattern, but
// the module import graph still resolves them at load time.
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

import { describe, it, expect } from '@jest/globals';
import { Vector3, Triangle } from 'three';

import { generateOutlinedBandPattern } from '../generate-outlined-pattern';
import type { Band, OutlinedPatternConfig, Quadrilateral } from '$lib/types';

/**
 * This test drives the REAL production path — `generateOutlinedBandPattern`'s
 * own call into `buildOutlinePath`, which in turn calls `shouldHaveTab` — not
 * `shouldHaveTab` in isolation (that's `split-end-tab.test.ts`). It exists to
 * catch a regression the isolated unit tests structurally cannot: `piece`
 * being dropped from the `buildOutlinePath(...)` call inside
 * `generateOutlinedBandPattern`, or `currentPiece` being dropped from the
 * `shouldHaveTab(...)` call inside `buildOutlinePath`. Both are optional
 * parameters that type-check fine when omitted and silently produce no seam
 * tab — the exact defect family (an optional parameter never passed) this
 * plan has hit six times.
 *
 * Asserting on `BandCutPattern.tabs` (via `collectOutlinedBandTabs`) rather
 * than on emitted tab path geometry: it's a smaller, more legible surface
 * (`position: 'start' | 'end' | 'mid'`) and a dropped `currentPiece` changes
 * it just as directly — no tab record is produced for the seam cap at all.
 */

const quad: Quadrilateral = {
	a: new Vector3(0, 0, 0),
	b: new Vector3(1, 0, 0),
	c: new Vector3(1, 1, 0),
	d: new Vector3(0, 1, 0)
};

// A minimal single-quad band: 2 facets (indices 0 and 1, matching the 2*i /
// 2*i+1 convention getOutlineEdges reads for before/after partner metadata),
// neither of which needs partner meta for this test — no side partners are
// passed in, so bandHasPartners is false on both sides and only the 'end'
// edges are in play.
const makeBand = (pieceIndex: number, seamAt: Band['seamAt']): Band => ({
	facets: [
		{ triangle: new Triangle(), orientation: 'axial-right' },
		{ triangle: new Triangle(), orientation: 'axial-right' }
	],
	orientation: 'axial-right',
	pieceIndex,
	seamAt
});

const config: OutlinedPatternConfig = {
	type: 'outlined',
	tabConfig: { shape: 'rectangle', tabWidth: 5, splitEnd: 'after' }
};

describe('generateOutlinedBandPattern — split seam tab, real wiring', () => {
	it('tabs the far (end) cap of the lower-indexed piece, not the near (start) cap of the higher-indexed sibling', () => {
		// Lower piece 0's far end (seamAt.end) is the seam; its partner across
		// the seam is piece 1, which is higher — under splitEnd: 'after' that
		// means piece 0 owns the tab.
		const lowerPiece = makeBand(0, { end: true });
		// Higher piece 1's near end (seamAt.start) is the same seam from the
		// other side; its partner is piece 0, which is lower — no tab.
		const higherPiece = makeBand(1, { start: true });

		const lowerResult = generateOutlinedBandPattern(
			lowerPiece,
			0,
			config,
			{ value: 1, unit: 'cm' },
			{ globule: 0, tube: 0 },
			[quad],
			undefined,
			undefined,
			1,
			0,
			lowerPiece.pieceIndex
		);
		const higherResult = generateOutlinedBandPattern(
			higherPiece,
			0,
			config,
			{ value: 1, unit: 'cm' },
			{ globule: 0, tube: 0 },
			[quad],
			undefined,
			undefined,
			1,
			0,
			higherPiece.pieceIndex
		);

		expect(lowerResult.tabs?.some((t) => t.position === 'end')).toBe(true);
		// No tab at all on the higher-indexed sibling's near cap — `tabs` may be
		// entirely undefined (collectOutlinedBandTabs returns undefined when no
		// edge got a tab), which is itself the "no tab" outcome under test.
		expect(higherResult.tabs?.some((t) => t.position === 'start') ?? false).toBe(false);
	});
});
