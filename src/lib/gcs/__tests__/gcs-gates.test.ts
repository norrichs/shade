import type { GlobuleConfig, PipelineGates, SuperGlobule, SuperGlobuleConfig } from '#lib/types.js';
import type { GcsValidation } from '../validate-shape-configs';
import { applyBlocks, backfillBlocked, gcsBlockedPipelines } from '../gcs-gates';

const gc = (id: number) => ({ id }) as unknown as GlobuleConfig;
const stubValidate = (g: GlobuleConfig): GcsValidation =>
	(g as unknown as { id: number }).id < 0
		? {
				isValid: false,
				errors: [{ index: 1, message: `bad ${(g as unknown as { id: number }).id}` }],
				levels: [],
				bandCount: 0
			}
		: { isValid: true, errors: [], levels: [], bandCount: 0 };

const cfg = (ids: number[], surfaceType: string | null): SuperGlobuleConfig =>
	({
		subGlobuleConfigs: ids.map((id) => ({ globuleConfig: gc(id) })),
		projectionConfigs: surfaceType ? [{ surfaceConfig: { type: surfaceType } }] : []
	}) as unknown as SuperGlobuleConfig;

const allOn: PipelineGates = { globuleTube: true, projection: true, voronoi: true };
const sg = (tag: string) =>
	({
		globuleTubes: [tag],
		projections: [tag],
		voronoiResult: tag
	}) as unknown as SuperGlobule;
const empty = () =>
	({
		globuleTubes: [],
		projections: [],
		voronoiResult: undefined
	}) as unknown as SuperGlobule;

describe('gcsBlockedPipelines', () => {
	it('sphere surface not blocked', () => {
		const r = gcsBlockedPipelines(cfg([-1], 'SphereConfig'), stubValidate);
		expect(r.blocked).toEqual({ globuleTube: true });
		expect(r.message).toBe('Cross section: bad -1');
	});
	it('globule surface blocks projection and voronoi', () => {
		const r = gcsBlockedPipelines(cfg([-1], 'GlobuleConfig'), stubValidate);
		expect(r.blocked).toEqual({
			globuleTube: true,
			projection: true,
			voronoi: true
		});
	});
	it('valid → nothing blocked, message null', () => {
		const r = gcsBlockedPipelines(cfg([1], 'GlobuleConfig'), stubValidate);
		expect(r).toEqual({ blocked: {}, message: null });
	});
	it('applyBlocks turns blocked gates off', () => {
		expect(applyBlocks(allOn, { globuleTube: true, voronoi: true })).toEqual({
			globuleTube: false,
			projection: true,
			voronoi: false
		});
	});
});

describe('backfillBlocked', () => {
	it('backfill copies previous for blocked', () => {
		const r = backfillBlocked(empty(), sg('prev'), { globuleTube: true, voronoi: true }, allOn);
		expect(r.globuleTubes).toEqual(['prev']);
		expect(r.voronoiResult).toBe('prev');
		expect(r.projections).toEqual([]);
	});
	it('user-disabled pipeline is not back-filled', () => {
		const r = backfillBlocked(
			empty(),
			sg('prev'),
			{ globuleTube: true },
			{ ...allOn, globuleTube: false }
		);
		expect(r.globuleTubes).toEqual([]);
	});
	it('no previous → empty', () => {
		const r = backfillBlocked(empty(), null, { globuleTube: true }, allOn);
		expect(r.globuleTubes).toEqual([]);
	});
	it('returns the same object when nothing is blocked', () => {
		const r = empty();
		expect(backfillBlocked(r, sg('prev'), {}, allOn)).toBe(r);
	});
	it('returns the same object when blocked pipeline is user-disabled', () => {
		const r = empty();
		expect(
			backfillBlocked(r, sg('prev'), { globuleTube: true }, { ...allOn, globuleTube: false })
		).toBe(r);
	});
});
