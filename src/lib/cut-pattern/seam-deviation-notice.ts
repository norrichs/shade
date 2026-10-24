import type { BandCutPattern } from '#lib/types.js';
import type { GlobuleAddress_Band } from '#lib/projection-geometry/types.js';
import type { Toast } from '#lib/stores/toastStore.js';
import { formatBandAddress } from './band-partner-info';

const MAX_LISTED = 5;
export const DEFAULT_SEAM_DEVIATION_THRESHOLD = 0.1;

export type SeamDeviation = { address: GlobuleAddress_Band; facet: number; score: number };

type MaybeProjectionCutPattern = {
	projectionCutPattern?: { tubes?: { bands?: BandCutPattern[] }[] };
};

/** Every facet, across all results, whose seam deviation is over `threshold`; worst first. */
export const collectSeamDeviations = (patterns: unknown[], threshold: number): SeamDeviation[] =>
	patterns
		.flatMap((pattern) =>
			(
				(pattern as MaybeProjectionCutPattern | undefined)?.projectionCutPattern?.tubes ?? []
			).flatMap((tube) =>
				(tube.bands ?? []).flatMap((band) =>
					(band.seamDeviation ?? []).flatMap((score, facet) =>
						score > threshold ? [{ address: band.address, facet, score }] : []
					)
				)
			)
		)
		.sort((a, b) => b.score - a.score);

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** One summary line for every flagged quad. */
export const formatSeamDeviationMessage = (flagged: SeamDeviation[], threshold: number): string => {
	const listed = flagged
		.slice(0, MAX_LISTED)
		.map(
			({ address, facet, score }) =>
				`${formatBandAddress(address)} quad ${facet} (${percent(score)})`
		);
	const more = flagged.length - listed.length;
	if (more > 0) listed.push(`and ${more} more`);
	const count = flagged.length === 1 ? '1 quad has' : `${flagged.length} quads have`;
	return `${count} seam flap nodes off by more than ${percent(threshold)} of the quad: ${listed.join('; ')}.`;
};

type ToastDeps = {
	add: (toast: Omit<Toast, 'id'>) => string;
	remove: (id: string) => void;
};

/**
 * Keeps at most one seam-deviation toast in step with the latest pattern
 * result, like `createDroppedSplitsNotifier`: an unchanged set raises no fresh
 * toast, a changed set replaces it, and an empty set removes it.
 */
export const createSeamDeviationNotifier = ({ add, remove }: ToastDeps) => {
	let lastKey = '';
	let toastId: string | undefined;

	return (flagged: SeamDeviation[], threshold: number) => {
		const key = `${threshold}|${flagged
			.map(
				({ address, facet, score }) => `${formatBandAddress(address)}:${facet}:${percent(score)}`
			)
			.join('|')}`;
		if (key === lastKey) return;
		lastKey = key;

		if (toastId !== undefined) {
			remove(toastId);
			toastId = undefined;
		}
		if (flagged.length === 0) return;

		toastId = add({
			type: 'warning',
			message: formatSeamDeviationMessage(flagged, threshold),
			dismissible: true
		});
	};
};
