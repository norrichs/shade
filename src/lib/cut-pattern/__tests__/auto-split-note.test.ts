import { describe, it, expect } from '@jest/globals';

import { describeAutoSplitResult } from '../auto-split-note';

describe('describeAutoSplitResult', () => {
	it('reports the splits added when the result fits', () => {
		expect(describeAutoSplitResult({ added: 3, tubes: 2, stillOverflows: false })).toBe(
			'added 3 split(s) across 2 tube(s)'
		);
	});

	it('says so when the result still overflows, instead of claiming success', () => {
		const note = describeAutoSplitResult({ added: 3, tubes: 2, stillOverflows: true });
		expect(note).toContain('added 3 split(s) across 2 tube(s)');
		expect(note).toContain('still overflow');
	});

	it('reports an idempotent click as adding nothing, overflow or not', () => {
		expect(describeAutoSplitResult({ added: 0, tubes: 1, stillOverflows: true })).toBe(
			'already split there — nothing added'
		);
		expect(describeAutoSplitResult({ added: 0, tubes: 1, stillOverflows: false })).toBe(
			'already split there — nothing added'
		);
	});
});
