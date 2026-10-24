import type { BandCutPattern } from '#lib/types.js';
import {
	collectSeamDeviations,
	createSeamDeviationNotifier,
	formatSeamDeviationMessage
} from '../seam-deviation-notice';

const band = (b: number, seamDeviation?: number[]) =>
	({
		address: { globule: 0, tube: 2, band: b },
		facets: [],
		seamDeviation
	}) as unknown as BandCutPattern;
const result = (...bands: BandCutPattern[]) => ({ projectionCutPattern: { tubes: [{ bands }] } });

describe('collectSeamDeviations', () => {
	it('lists facets over the threshold, worst first, across results', () => {
		const flagged = collectSeamDeviations(
			[result(band(0, [0, 0.12, 0.05]), band(1)), undefined, result(band(3, [0.3]))],
			0.1
		);
		expect(flagged.map(({ address, facet, score }) => [address.band, facet, score])).toEqual([
			[3, 0, 0.3],
			[0, 1, 0.12]
		]);
	});
});

describe('formatSeamDeviationMessage', () => {
	it('names each quad with its score, and counts the rest', () => {
		const flagged = Array.from({ length: 7 }, (_, facet) => ({
			address: { globule: 0, tube: 2, band: 4 },
			facet,
			score: 0.25
		}));
		const message = formatSeamDeviationMessage(flagged, 0.1);
		expect(message).toMatch(/^7 quads have seam flap nodes off by more than 10% of the quad: /);
		expect(message).toContain('t2/b4 quad 0 (25%)');
		expect(message).toContain('and 2 more');
	});
});

describe('createSeamDeviationNotifier', () => {
	it('raises one toast per distinct set, replaces it on change and clears it when empty', () => {
		const added: string[] = [];
		const removed: string[] = [];
		const notify = createSeamDeviationNotifier({
			add: (toast) => {
				added.push(toast.message);
				return `id${added.length}`;
			},
			remove: (id) => removed.push(id)
		});
		const one = collectSeamDeviations([result(band(0, [0.2]))], 0.1);
		notify(one, 0.1);
		notify(one, 0.1);
		expect(added).toHaveLength(1);
		notify(collectSeamDeviations([result(band(0, [0.4]))], 0.1), 0.1);
		expect(added).toHaveLength(2);
		expect(removed).toEqual(['id1']);
		notify([], 0.1);
		expect(removed).toEqual(['id1', 'id2']);
		expect(added).toHaveLength(2);
	});
});
