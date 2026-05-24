import { collateTubes } from '../collate-tubes';
import type { TubeCutPattern } from '$lib/types';
import type { SuperGlobuleProjectionPattern } from '$lib/stores/superGlobuleStores';

const makeTube = (id: string): TubeCutPattern =>
	({
		projectionType: 'patterned',
		address: { globule: 0, tube: 0 },
		bands: [{ id } as never]
	}) as unknown as TubeCutPattern;

const makeCutPattern = (tubeIds: string[]): SuperGlobuleProjectionPattern =>
	({
		type: 'SuperGlobuleProjectionCutPattern',
		superGlobuleConfigId: 'cfg',
		projectionCutPattern: {
			address: { globule: 0 },
			tubes: tubeIds.map(makeTube)
		}
	}) as unknown as SuperGlobuleProjectionPattern;

const allOff = {
	showGlobuleTubeGeometry: { any: false, bands: false, facets: false, sections: false } as never,
	showProjectionGeometry: { any: false, bands: false, facets: false } as never
};

const allOn = {
	showGlobuleTubeGeometry: { any: true, bands: true, facets: true, sections: true } as never,
	showProjectionGeometry: { any: true, bands: true, facets: true } as never
};

describe('collateTubes', () => {
	test('returns empty when all variants are absent', () => {
		const out = collateTubes({
			globuleTubePattern: null,
			projectionPattern: undefined,
			surfaceProjectionPattern: undefined,
			...allOn,
			patternSource: 'projection'
		});
		expect(out).toEqual([]);
	});

	test('uses surfaceProjectionPattern when patternSource is surfaceProjection', () => {
		const out = collateTubes({
			globuleTubePattern: null,
			projectionPattern: makeCutPattern(['proj-0']),
			surfaceProjectionPattern: makeCutPattern(['surf-0']),
			...allOn,
			patternSource: 'surfaceProjection'
		});
		expect(out.map((t) => t.bands[0].id)).toEqual(['surf-0']);
	});

	test('uses projectionPattern when patternSource is projection', () => {
		const out = collateTubes({
			globuleTubePattern: null,
			projectionPattern: makeCutPattern(['proj-0']),
			surfaceProjectionPattern: makeCutPattern(['surf-0']),
			...allOn,
			patternSource: 'projection'
		});
		expect(out.map((t) => t.bands[0].id)).toEqual(['proj-0']);
	});

	test('concatenates globuleTubePattern with the active projection variant', () => {
		const out = collateTubes({
			globuleTubePattern: makeCutPattern(['gt-0']),
			projectionPattern: undefined,
			surfaceProjectionPattern: makeCutPattern(['surf-0']),
			...allOn,
			patternSource: 'surfaceProjection'
		});
		expect(out.map((t) => t.bands[0].id)).toEqual(['gt-0', 'surf-0']);
	});

	test('regression: does not silently fall through to globuleTubePattern when surfaceProjection is selected', () => {
		// The original buggy chain (`projectionPattern ?? globuleTubePattern ?? surfaceProjectionPattern`)
		// returned globuleTubePattern here, even though the user is viewing surfaceProjection.
		const out = collateTubes({
			globuleTubePattern: makeCutPattern(['gt-0']),
			projectionPattern: undefined,
			surfaceProjectionPattern: makeCutPattern(['surf-0']),
			showGlobuleTubeGeometry: { any: false, bands: false, facets: false, sections: false } as never,
			showProjectionGeometry: { any: true, bands: true, facets: true } as never,
			patternSource: 'surfaceProjection'
		});
		expect(out.map((t) => t.bands[0].id)).toEqual(['surf-0']);
	});

	test('respects showGlobuleTubeGeometry.any toggle', () => {
		const out = collateTubes({
			globuleTubePattern: makeCutPattern(['gt-0']),
			projectionPattern: undefined,
			surfaceProjectionPattern: undefined,
			...allOff,
			patternSource: 'projection'
		});
		expect(out).toEqual([]);
	});

	test('respects showProjectionGeometry.any toggle', () => {
		const out = collateTubes({
			globuleTubePattern: null,
			projectionPattern: makeCutPattern(['proj-0']),
			surfaceProjectionPattern: undefined,
			...allOff,
			patternSource: 'projection'
		});
		expect(out).toEqual([]);
	});

	test('treats empty-tubes variant as absent', () => {
		const out = collateTubes({
			globuleTubePattern: null,
			projectionPattern: makeCutPattern([]),
			surfaceProjectionPattern: makeCutPattern(['surf-0']),
			...allOn,
			patternSource: 'projection'
		});
		expect(out).toEqual([]);
	});

	test('ignores non-cut-pattern variant shape', () => {
		const panelLike = {
			type: 'SuperGlobuleProjectionPanelPattern',
			superGlobuleConfigId: 'cfg'
		} as unknown as SuperGlobuleProjectionPattern;
		const out = collateTubes({
			globuleTubePattern: null,
			projectionPattern: panelLike,
			surfaceProjectionPattern: undefined,
			...allOn,
			patternSource: 'projection'
		});
		expect(out).toEqual([]);
	});
});
