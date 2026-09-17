import { describe, it, expect, beforeAll } from '@jest/globals';
import { createHash } from 'crypto';
import { generateSuperGlobule } from '$lib/generate-superglobule';
import {
	defaultOutlinedPatternConfig,
	generateDefaultGlobulePatternConfig,
	generateDefaultSuperGlobuleConfig
} from '$lib/shades-config';
import { runPatternGeneration } from '../run-pattern-generation';
import { resolveTabLabel } from '../resolve-tab-label';
import { buildPatternCsv } from '../build-pattern-csv';
import { buildBandSortIndex } from '../band-sort-index';
import type { SuperGlobuleProjectionCutPattern } from '$lib/stores/superGlobuleStores';
import type { PatternGenerationConfig } from '$lib/stores/globulePatternStores';
import type { PatternTypeConfig, PipelineGates, TubeCutPattern } from '$lib/types';

/**
 * GUARD (Task 10): unsplit tab labels and CSV text must not change.
 *
 * Real, unmocked generation on the default superglobule (30 tubes × 6 bands).
 * Values were recorded from `494fcb6`, which a side-by-side run against the
 * pre-Task-10 resolvers showed byte-identical (0 of 1800 outlined tab labels,
 * and both CSV modes, for tiled and outlined). Asserted as counts, a few
 * sampled lines and a sha256 rather than a snapshot, so a failure names what
 * moved without committing megabytes of text.
 */

const gates: PipelineGates = {
	globule: false,
	globuleTube: false,
	projection: true,
	voronoi: false
};

const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

const outlinedWithTabs = (): PatternTypeConfig => {
	const config = defaultOutlinedPatternConfig();
	config.tabConfig = {
		...config.tabConfig!,
		shape: 'rectangle',
		bandEdge: 'beforeAndAfter',
		bandEnd: 'beforeAndAfter'
	};
	return config;
};

let superGlobule: ReturnType<typeof generateSuperGlobule>;
const superConfig = generateDefaultSuperGlobuleConfig();

const generate = (patternTypeConfig: PatternTypeConfig): TubeCutPattern[] => {
	const genConfig: PatternGenerationConfig = {
		patternTypeConfig,
		pixelScale: generateDefaultGlobulePatternConfig().patternConfig.pixelScale,
		showBands: true,
		range: { tubes: undefined, bands: undefined, facets: undefined },
		patternSource: 'projection'
	};
	const result = runPatternGeneration({ superGlobule, superConfig, genConfig, gates });
	return (result.projectionPattern as SuperGlobuleProjectionCutPattern).projectionCutPattern.tubes;
};

const csvs = (tubes: TubeCutPattern[]) => ({
	tubeOrder: buildPatternCsv(buildBandSortIndex(tubes, 'tube-order'), tubes),
	endConnection: buildPatternCsv(buildBandSortIndex(tubes, 'end-connection-tube'), tubes)
});

describe('GUARD: unsplit tab labels and CSV are unchanged (real default geometry)', () => {
	beforeAll(() => {
		superGlobule = generateSuperGlobule(superConfig, gates);
	});

	it('outlined: every tab label, and both CSV modes', () => {
		const tubes = generate(outlinedWithTabs());
		const labels = tubes.flatMap((tube) =>
			tube.bands.flatMap((band) =>
				(band.tabs ?? []).map((tab) => resolveTabLabel(tab, band, tube, tubes))
			)
		);
		const { tubeOrder, endConnection } = csvs(tubes);
		expect({
			bands: tubes.reduce((n, t) => n + t.bands.length, 0),
			tabs: labels.length,
			nonEmptyLabels: labels.filter(Boolean).length,
			labelsSample: labels.slice(0, 12),
			labelsSha: sha(labels.join('\n')),
			tubeOrderRows: tubeOrder.split('\n').slice(0, 4),
			tubeOrderSha: sha(tubeOrder),
			endConnectionRows: endConnection.split('\n').slice(0, 3),
			endConnectionSha: sha(endConnection)
		}).toEqual(OUTLINED);
	});

	it('tiled: both CSV modes', () => {
		const tubes = generate(generateDefaultGlobulePatternConfig().patternTypeConfig);
		const { tubeOrder, endConnection } = csvs(tubes);
		expect({
			bands: tubes.reduce((n, t) => n + t.bands.length, 0),
			tubeOrderRows: tubeOrder.split('\n').slice(0, 4),
			tubeOrderSha: sha(tubeOrder),
			endConnectionRows: endConnection.split('\n').slice(0, 3),
			endConnectionSha: sha(endConnection)
		}).toEqual(TILED);
	});
});

// Tiled and outlined share the default geometry's band addresses and partners,
// so their CSVs coincide.
const OUTLINED = {
	bands: 180,
	tabs: 1800,
	nonEmptyLabels: 540,
	labelsSample: ['t0/b1', '', '', '', 't4/b5', '', '', '', '', 't6/b5', 't0/b2', ''],
	labelsSha: '6bbfe66e635b55d9',
	tubeOrderRows: [
		'band,adjacent,endPartners',
		't0/b0,t0/b1,"t6/b5 t4/b5"',
		't0/b1,"t0/b0 t0/b2","t6/b4 t4/b4"',
		't0/b2,"t0/b1 t0/b3","t6/b3 t4/b3"'
	],
	tubeOrderSha: '553727565cf48f8d',
	endConnectionRows: [
		'ringCode,partnerRingCodes,members',
		'0000,0001,t0/b0,t6/b5,t4/b5',
		'0001,"0000 0002",t0/b1,t6/b4,t4/b4'
	],
	endConnectionSha: 'b5fcc2b6271e0a87'
};

const TILED = {
	bands: 180,
	tubeOrderRows: [
		'band,adjacent,endPartners',
		't0/b0,t0/b1,"t6/b5 t4/b5"',
		't0/b1,"t0/b0 t0/b2","t6/b4 t4/b4"',
		't0/b2,"t0/b1 t0/b3","t6/b3 t4/b3"'
	],
	tubeOrderSha: '553727565cf48f8d',
	endConnectionRows: [
		'ringCode,partnerRingCodes,members',
		'0000,0001,t0/b0,t6/b5,t4/b5',
		'0001,"0000 0002",t0/b1,t6/b4,t4/b4'
	],
	endConnectionSha: 'b5fcc2b6271e0a87'
};
