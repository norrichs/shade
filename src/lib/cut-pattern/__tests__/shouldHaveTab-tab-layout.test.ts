import { Vector3 } from 'three';
import { shouldHaveTab } from '../generate-outlined-pattern';
import type { OutlinedTabConfig } from '$lib/types';

// Minimal OutlineEdge for a before/after side. start/end/interiorPoint are
// unused by shouldHaveTab for before/after sides but required by the type.
const edge = (side: 'before' | 'after') => ({
	start: new Vector3(),
	end: new Vector3(),
	side,
	interiorPoint: new Vector3()
});

const cfg = (over: Partial<OutlinedTabConfig>): OutlinedTabConfig => ({
	shape: 'rectangle',
	tabWidth: 5,
	...over
});

const bothPartners = { after: true, before: true };

describe('shouldHaveTab with tabLayout (before+inner, 6-band tube)', () => {
	const conf = cfg({ bandEdge: 'before', tabLayout: 'inner' });
	// Expected per-band per-edge tab pattern from the worked example:
	// band0: none | band1: before | band2: before
	// band3: before+after | band4: after | band5: none
	const cases: Array<[number, 'before' | 'after', boolean]> = [
		[0, 'before', false],
		[0, 'after', false],
		[1, 'before', true],
		[1, 'after', false],
		[2, 'before', true],
		[2, 'after', false],
		[3, 'before', true],
		[3, 'after', true],
		[4, 'before', false],
		[4, 'after', true],
		[5, 'before', false],
		[5, 'after', false]
	];
	it.each(cases)('band %i edge %s => %s', (band, side, expected) => {
		expect(shouldHaveTab(edge(side), conf, bothPartners, 0, band, 6)).toBe(expected);
	});

	it('returns false on an edge whose side lacks a partner', () => {
		// band1 before would be true, but no before partner => no seam => no tab.
		expect(
			shouldHaveTab(edge('before'), conf, { after: true, before: false }, 0, 1, 6)
		).toBe(false);
	});
});

describe('shouldHaveTab regression: tabLayout undefined matches legacy', () => {
	it('before edge with bandEdge "before" => true regardless of band index', () => {
		const conf = cfg({ bandEdge: 'before' });
		expect(shouldHaveTab(edge('before'), conf, bothPartners, 0, 0, 6)).toBe(true);
		expect(shouldHaveTab(edge('before'), conf, bothPartners, 0, 5, 6)).toBe(true);
		expect(shouldHaveTab(edge('after'), conf, bothPartners, 0, 0, 6)).toBe(false);
	});
	it('after edge with bandEdge "after" => true; before => false', () => {
		const conf = cfg({ bandEdge: 'after' });
		expect(shouldHaveTab(edge('after'), conf, bothPartners, 0, 3, 6)).toBe(true);
		expect(shouldHaveTab(edge('before'), conf, bothPartners, 0, 3, 6)).toBe(false);
	});
	it('beforeAndAfter => both sides true', () => {
		const conf = cfg({ bandEdge: 'beforeAndAfter' });
		expect(shouldHaveTab(edge('before'), conf, bothPartners, 0, 2, 6)).toBe(true);
		expect(shouldHaveTab(edge('after'), conf, bothPartners, 0, 2, 6)).toBe(true);
	});
	it('respects hasPartners when layout undefined', () => {
		const conf = cfg({ bandEdge: 'before' });
		expect(
			shouldHaveTab(edge('before'), conf, { after: true, before: false }, 0, 2, 6)
		).toBe(false);
	});
});
