import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the heavy pipeline entry points so we can control success/failure per pipeline.
const makeProjection = jest.fn();
const makeVoronoi = jest.fn();
const generateGlobuleTube = jest.fn();
const generateGlobuleData = jest.fn();
const recombineSubGlobules = jest.fn();
const generateTransformedGlobules = jest.fn();

jest.mock('$lib/projection-geometry/generate-projection', () => ({
	makeProjection: (...args: unknown[]) => makeProjection(...args)
}));
jest.mock('$lib/voronoi/generate-voronoi', () => ({
	makeVoronoi: (...args: unknown[]) => makeVoronoi(...args)
}));
jest.mock('$lib/generate-shape', () => ({
	generateGlobuleTube: (...args: unknown[]) => generateGlobuleTube(...args),
	generateGlobuleData: (...args: unknown[]) => generateGlobuleData(...args)
}));
jest.mock('$lib/recombination', () => ({
	recombineSubGlobules: (...args: unknown[]) => recombineSubGlobules(...args)
}));
jest.mock('$lib/transform-globule', () => ({
	generateTransformedGlobules: (...args: unknown[]) => generateTransformedGlobules(...args)
}));
jest.mock('$lib/id-handler', () => ({
	generateTempId: () => 'temp-id'
}));

import { generateSuperGlobule, type PipelineGates } from '../generate-superglobule';
import type { SuperGlobuleConfig } from '../types';

const VORONOI_RESULT = { tubes: [], surfaceProjectionTubes: [], surface: {} as never };
const PROJECTION = { projection: {}, polyhedron: {}, tubes: [], surfaceProjectionTubes: [], surface: {} };

const baseConfig = (): SuperGlobuleConfig => ({
	type: 'SuperGlobuleConfig',
	id: 'super-1',
	name: 'test',
	subGlobuleConfigs: [{ globuleConfig: { id: 'glb-1' } } as never],
	projectionConfigs: [{ surfaceConfig: { type: 'SphereConfig' } } as never],
	voronoiConfig: { type: 'VoronoiConfig' } as never
});

const gates = (overrides: Partial<PipelineGates>): PipelineGates => ({
	globule: false,
	globuleTube: false,
	projection: false,
	voronoi: false,
	...overrides
});

beforeEach(() => {
	jest.clearAllMocks();
	recombineSubGlobules.mockReturnValue([]);
	generateGlobuleTube.mockReturnValue({ bands: [], sections: [] });
	makeProjection.mockReturnValue(PROJECTION);
	makeVoronoi.mockReturnValue(VORONOI_RESULT);
});

describe('generateSuperGlobule pipeline gating', () => {
	it('skips a pipeline whose gate is false (does not invoke it)', () => {
		const result = generateSuperGlobule(baseConfig(), gates({ voronoi: true }));
		expect(makeProjection).not.toHaveBeenCalled();
		expect(generateGlobuleTube).not.toHaveBeenCalled();
		expect(makeVoronoi).toHaveBeenCalledTimes(1);
		expect(result.projections).toEqual([]);
		expect(result.globuleTubes).toEqual([]);
		expect(result.voronoiResult).toBe(VORONOI_RESULT);
	});

	it('runs only the gated-on pipelines', () => {
		const result = generateSuperGlobule(baseConfig(), gates({ projection: true }));
		expect(makeProjection).toHaveBeenCalledTimes(1);
		expect(makeVoronoi).not.toHaveBeenCalled();
		expect(result.projections.length).toBe(1);
		expect(result.voronoiResult).toBeUndefined();
	});
});

describe('generateSuperGlobule fault isolation', () => {
	it('isolates a failing pipeline so others still produce output', () => {
		makeProjection.mockImplementation(() => {
			throw new Error('No intersection found ... Try enabling end caps.');
		});
		// Projection enabled (and failing) AND voronoi enabled.
		const result = generateSuperGlobule(baseConfig(), gates({ projection: true, voronoi: true }));

		// The throw is isolated: the call does NOT propagate, voronoi still produced.
		expect(result.voronoiResult).toBe(VORONOI_RESULT);
		expect(result.projections).toEqual([]);
		// The failure is recorded as a non-fatal pipeline error.
		expect(result.pipelineErrors).toBeDefined();
		expect(result.pipelineErrors).toHaveLength(1);
		expect(result.pipelineErrors![0].pipeline).toBe('projection');
		expect(result.pipelineErrors![0].message).toMatch(/end caps/);
	});

	it('omits pipelineErrors when everything succeeds', () => {
		const result = generateSuperGlobule(baseConfig(), gates({ projection: true, voronoi: true }));
		expect(result.pipelineErrors).toBeUndefined();
	});

	it('does not run a failing pipeline at all when its gate is off', () => {
		makeProjection.mockImplementation(() => {
			throw new Error('should never be called');
		});
		const result = generateSuperGlobule(baseConfig(), gates({ voronoi: true }));
		expect(makeProjection).not.toHaveBeenCalled();
		expect(result.pipelineErrors).toBeUndefined();
		expect(result.voronoiResult).toBe(VORONOI_RESULT);
	});
});

describe('generateSuperGlobule default gates', () => {
	it('runs all pipelines when no gates are passed (backward compatible)', () => {
		generateSuperGlobule(baseConfig());
		expect(makeProjection).toHaveBeenCalledTimes(1);
		expect(makeVoronoi).toHaveBeenCalledTimes(1);
		expect(generateGlobuleTube).toHaveBeenCalledTimes(1);
	});
});
