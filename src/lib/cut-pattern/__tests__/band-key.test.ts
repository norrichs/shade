import { describe, it, expect } from '@jest/globals';

import { bandKey } from '../band-key';

describe('bandKey', () => {
	it('keeps the historical shape for an unsplit band', () => {
		// Four separate copies of this function previously existed, all producing
		// `${globule}-${tube}-${band}`. Existing persisted group codes and CSV
		// output depend on this exact shape.
		expect(bandKey({ globule: 0, tube: 1, band: 2 })).toBe('0-1-2');
	});

	it('distinguishes sibling pieces', () => {
		expect(bandKey({ globule: 0, tube: 1, band: 2, piece: 0 })).toBe('0-1-2-p0');
		expect(bandKey({ globule: 0, tube: 1, band: 2, piece: 1 })).toBe('0-1-2-p1');
	});

	it('does not collide a piece with its parent band', () => {
		expect(bandKey({ globule: 0, tube: 1, band: 2, piece: 0 })).not.toBe(
			bandKey({ globule: 0, tube: 1, band: 2 })
		);
	});
});
