import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const generateProjectionPattern = jest.fn();

jest.mock('../generate-pattern', () => ({
	generateProjectionPattern: (...args: unknown[]) => generateProjectionPattern(...args)
}));

import { runPatternGeneration, EMPTY_PATTERN_RESULT } from '../run-pattern-generation';
import type { PatternGenerationInput } from '../run-pattern-generation';

const tube = (n: number) => ({ address: { globule: 0, tube: n }, bands: [], sections: [] });

const input = (over: Partial<PatternGenerationInput> = {}): PatternGenerationInput => ({
	superGlobule: {
		projections: [{ tubes: [tube(0)], surfaceProjectionTubes: [tube(1)] }],
		globuleTubes: [tube(2)],
		voronoiResult: { tubes: [tube(3)], surfaceProjectionTubes: [] }
	} as unknown as PatternGenerationInput['superGlobule'],
	superConfig: { id: 'cfg-1' } as PatternGenerationInput['superConfig'],
	genConfig: {
		patternTypeConfig: { type: 'tiled' },
		pixelScale: { value: 1, unit: 'mm' },
		showBands: true,
		range: { tubes: undefined, bands: undefined, facets: undefined },
		patternSource: 'voronoi'
	} as unknown as PatternGenerationInput['genConfig'],
	gates: { globuleTube: true, projection: true, voronoi: true },
	...over
});

beforeEach(() => {
	generateProjectionPattern.mockReset().mockImplementation((tubes: unknown) => ({ tubes }));
});

describe('runPatternGeneration', () => {
	it('generates only the selected source', () => {
		const out = runPatternGeneration(input());
		expect(generateProjectionPattern).toHaveBeenCalledTimes(1);
		expect(out.voronoiPattern).toEqual({ tubes: [tube(3)] });
		expect(out.projectionPattern).toBeUndefined();
		expect(out.globuleTubePattern).toBeNull();
	});

	it('passes the config id and range through to generateProjectionPattern', () => {
		const range = { tubes: [0, 2] as [number, number], bands: undefined, facets: undefined };
		runPatternGeneration(input({ genConfig: { ...input().genConfig, range } }));
		const [tubes, id, cfg, passedRange] = generateProjectionPattern.mock.calls[0] as unknown[];
		expect(tubes).toEqual([tube(3)]);
		expect(id).toBe('cfg-1');
		expect((cfg as { patternViewConfig: { range: unknown } }).patternViewConfig.range).toBe(range);
		expect(passedRange).toBe(range);
	});

	it('generates the globule tube pattern for the globule source', () => {
		const base = input();
		const out = runPatternGeneration({
			...base,
			genConfig: { ...base.genConfig, patternSource: 'globule' }
		});
		expect(generateProjectionPattern).toHaveBeenCalledTimes(1);
		expect(out.globuleTubePattern).toEqual({ tubes: [tube(2)] });
		expect(out.voronoiPattern).toBeUndefined();
	});

	it('skips sources with no tubes even when selected', () => {
		const base = input();
		const out = runPatternGeneration({
			...base,
			genConfig: { ...base.genConfig, patternSource: 'voronoiSurface' }
		});
		expect(generateProjectionPattern).not.toHaveBeenCalled();
		expect(out).toEqual(EMPTY_PATTERN_RESULT);
	});

	it('generates nothing when showBands is off', () => {
		const base = input();
		const out = runPatternGeneration({
			...base,
			genConfig: { ...base.genConfig, showBands: false }
		});
		expect(generateProjectionPattern).not.toHaveBeenCalled();
		expect(out.voronoiPattern).toBeUndefined();
	});
});
