import { describe, it, expect } from '@jest/globals';
import { Vector3 } from 'three';

import { shouldHaveTab } from '../generate-outlined-pattern';
import type { OutlinedTabConfig } from '$lib/types';

const base: OutlinedTabConfig = { shape: 'rectangle', tabWidth: 5 };
const noPartners = { after: false, before: false };

describe('shouldHaveTab — split ends', () => {
	// `start`, `end` and `interiorPoint` are declared as Vector3 on OutlineEdge
	// (generate-outlined-pattern.ts:84-88), so `{ x, y }` literals do not
	// compile — and casting past it would break generateTabForEdge's
	// .clone()/vector math if the branch is ever taken. The existing
	// shouldHaveTab-tab-layout.test.ts uses `new Vector3()` for the same reason.
	const seamEdge = (seamPartnerPiece: number) => ({
		start: new Vector3(0, 0, 0),
		end: new Vector3(1, 0, 0),
		side: 'end' as const,
		interiorPoint: new Vector3(0.5, 0.5, 0),
		seamPartnerPiece
	});

	it('gives no tab when splitEnd is unset', () => {
		// Default must not change outlined output for anyone not using splits.
		// Note the trailing currentPiece arg: without it the seam branch does not
		// engage at all and this would pass via fallthrough, testing nothing.
		expect(shouldHaveTab(seamEdge(1), base, noPartners, 0, 0, 1, 0)).toBe(false);
	});

	it('ignores the seam branch entirely when currentPiece is unknown', () => {
		// Callers that predate pieces pass no currentPiece. Such an edge must fall
		// through to the existing bandEnd rule rather than being treated as a seam.
		const config = { ...base, splitEnd: 'beforeAndAfter' as const };
		expect(shouldHaveTab(seamEdge(1), config, noPartners, 0, 0, 1)).toBe(false);
	});

	it("'after' tabs the lower-indexed piece", () => {
		const config = { ...base, splitEnd: 'after' as const };
		// own piece 0, partner piece 1 => partner is after => tab.
		expect(shouldHaveTab(seamEdge(1), config, noPartners, 0, 0, 1, 0)).toBe(true);
		// own piece 1, partner piece 0 => partner is before => no tab.
		expect(shouldHaveTab(seamEdge(0), config, noPartners, 0, 0, 1, 1)).toBe(false);
	});

	it("'before' tabs the higher-indexed piece", () => {
		const config = { ...base, splitEnd: 'before' as const };
		expect(shouldHaveTab(seamEdge(1), config, noPartners, 0, 0, 1, 0)).toBe(false);
		expect(shouldHaveTab(seamEdge(0), config, noPartners, 0, 0, 1, 1)).toBe(true);
	});

	it("'beforeAndAfter' tabs both, which would double the joint", () => {
		const config = { ...base, splitEnd: 'beforeAndAfter' as const };
		expect(shouldHaveTab(seamEdge(1), config, noPartners, 0, 0, 1, 0)).toBe(true);
		expect(shouldHaveTab(seamEdge(0), config, noPartners, 0, 0, 1, 1)).toBe(true);
	});

	it('leaves a non-seam end edge to the existing bandEnd rule', () => {
		const config = { ...base, splitEnd: 'after' as const };
		const plainEnd = {
			start: new Vector3(0, 0, 0),
			end: new Vector3(1, 0, 0),
			side: 'end' as const,
			interiorPoint: new Vector3(0.5, 0.5, 0)
		};
		// No seamPartnerPiece and no endPartnerTube => no tab, as today.
		expect(shouldHaveTab(plainEnd, config, noPartners, 0, 0, 1, 0)).toBe(false);
	});
});
