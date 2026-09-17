import { describe, it, expect } from '@jest/globals';

import { validateSplitConfig } from '../validators';

describe('validateSplitConfig', () => {
	it('keeps in-range splits, sorted and deduplicated', () => {
		const result = validateSplitConfig(
			{ tubeSplits: [{ tube: 0, quads: [6, 2, 2, 4] }] },
			{ 0: 10 }
		);
		expect(result.config.tubeSplits).toEqual([{ tube: 0, quads: [2, 4, 6] }]);
		expect(result.dropped).toEqual([]);
	});

	it('drops splits at or beyond the quad count', () => {
		// A shrinking quad count (e.g. fewer edge divisions) must not leave a
		// dangling index behind.
		const result = validateSplitConfig(
			{ tubeSplits: [{ tube: 0, quads: [2, 6, 10, 99] }] },
			{ 0: 6 }
		);
		expect(result.config.tubeSplits).toEqual([{ tube: 0, quads: [2] }]);
	});

	it('reports what it dropped, so the panel can say so', () => {
		// The cleaned config alone carries no record of the loss, and the Splits
		// panel has to render "3 splits dropped as out of range".
		const result = validateSplitConfig(
			{ tubeSplits: [{ tube: 0, quads: [2, 6, 10, 99] }] },
			{ 0: 6 }
		);
		expect(result.dropped).toEqual([{ tube: 0, quads: [6, 10, 99] }]);
	});

	it('drops a zero split, which would produce an empty piece', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 0, quads: [0, 3] }] }, { 0: 6 });
		expect(result.config.tubeSplits).toEqual([{ tube: 0, quads: [3] }]);
		expect(result.dropped).toEqual([{ tube: 0, quads: [0] }]);
	});

	it('drops negative and non-integer splits', () => {
		const result = validateSplitConfig(
			{ tubeSplits: [{ tube: 0, quads: [-1, 2.5, 3] }] },
			{ 0: 6 }
		);
		expect(result.config.tubeSplits).toEqual([{ tube: 0, quads: [3] }]);
		expect(result.dropped).toEqual([{ tube: 0, quads: [-1, 2.5] }]);
	});

	it('removes a tube entry whose splits are all dropped', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 0, quads: [99] }] }, { 0: 6 });
		expect(result.config.tubeSplits).toEqual([]);
		expect(result.dropped).toEqual([{ tube: 0, quads: [99] }]);
	});

	it('drops splits for a tube with no known quad count', () => {
		const result = validateSplitConfig({ tubeSplits: [{ tube: 7, quads: [2] }] }, { 0: 6 });
		expect(result.config.tubeSplits).toEqual([]);
		expect(result.dropped).toEqual([{ tube: 7, quads: [2] }]);
	});
});
