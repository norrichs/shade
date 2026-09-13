import type { BandCutPattern } from '$lib/types';
import { formatBandAddress } from './band-partner-info';

type MaybeProjectionCutPattern = {
	projectionCutPattern?: { tubes?: { bands?: BandCutPattern[] }[] };
};

/** Human-readable list of bands that could not be patterned, across all results. */
export const collectBandErrors = (patterns: unknown[]): string[] =>
	patterns.flatMap((pattern) =>
		((pattern as MaybeProjectionCutPattern | undefined)?.projectionCutPattern?.tubes ?? []).flatMap(
			(tube) =>
				(tube.bands ?? [])
					.filter((band) => band.error)
					.map((band) => `${formatBandAddress(band.address)}: ${band.error}`)
		)
	);
