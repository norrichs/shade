import { mergeBand as defaultMergeBand, type MergeCtx } from '$lib/cut-pattern/merge-band';
import type { BandMergePayload } from '$lib/cut-pattern/band-merge-payload';
import { buildContourIndex, type BandContourIndex } from '$lib/cut-pattern/contour-index';
import type { PathSegment } from '$lib/types';

/**
 * Message protocol between the pool and one band-merge worker.
 *
 * Unlike the geometry worker, a band-merge worker holds no state between
 * messages: every request carries everything the merge needs. That is what lets
 * the pool hand any band to any free worker.
 */
export type MergeMessage = {
	type: 'merge';
	bandId: string;
	payload: BandMergePayload;
	ctx: MergeCtx;
};

export type MergeResponse =
	| { type: 'merge-result'; bandId: string; path: PathSegment[]; contours: BandContourIndex }
	| { type: 'merge-error'; bandId: string; error: string };

export type BandMergeCoreDeps = {
	mergeBand: typeof defaultMergeBand;
};

export const createBandMergeCore = (overrides: Partial<BandMergeCoreDeps> = {}) => {
	const deps: BandMergeCoreDeps = { mergeBand: defaultMergeBand, ...overrides };

	const handle = (message: MergeMessage, post: (response: MergeResponse) => void) => {
		if (message.type !== 'merge') return;
		try {
			const path = deps.mergeBand(message.payload, message.ctx);
			// Stage 1b. Config-independent, so it runs here, where the facets, the
			// piece span and the seed are already in hand, where the main thread
			// then needs none of them. Outlined bands are indexed too (for their
			// ends); their contours are all `outline`.
			const contours = buildContourIndex(path, message.payload, message.ctx.patternType);
			post({ type: 'merge-result', bandId: message.bandId, path, contours });
		} catch (error) {
			post({
				type: 'merge-error',
				bandId: message.bandId,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	};

	return { handle };
};
