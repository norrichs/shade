import { collectBandErrors } from '../collect-band-errors';

const pattern = (bands: { band: number; error?: string }[]) => ({
	type: 'SuperGlobuleProjectionCutPattern',
	projectionCutPattern: {
		tubes: [
			{ bands: bands.map(({ band, error }) => ({ address: { globule: 0, tube: 2, band }, error })) }
		]
	}
});

describe('collectBandErrors', () => {
	it('lists every errored band with its address', () => {
		expect(
			collectBandErrors([pattern([{ band: 0, error: 'bad' }, { band: 1 }]), undefined])
		).toEqual(['t2/b0: bad']);
	});

	it('ignores results that are not projection cut patterns', () => {
		expect(collectBandErrors([{ type: 'SuperGlobuleProjectionPanelPattern' }, undefined])).toEqual(
			[]
		);
	});
});
