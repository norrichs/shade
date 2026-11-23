import type { BandCutPattern } from '#lib/types.js';
import type { Toast } from '#lib/stores/toastStore.js';

type MaybeProjectionCutPattern = {
	projectionCutPattern?: { tubes?: { bands?: BandCutPattern[] }[] };
};

/** Every distinct band `notice` across all results, in first-seen order. */
export const collectBandNotices = (patterns: unknown[]): string[] => [
	...new Set(
		patterns.flatMap((pattern) =>
			(
				(pattern as MaybeProjectionCutPattern | undefined)?.projectionCutPattern?.tubes ?? []
			).flatMap((tube) => (tube.bands ?? []).flatMap((band) => (band.notice ? [band.notice] : [])))
		)
	)
];

type ToastDeps = {
	add: (toast: Omit<Toast, 'id'>) => string;
	remove: (id: string) => void;
};

/**
 * Keeps at most one band-notice toast in step with the latest pattern result,
 * like `createSeamDeviationNotifier`: an unchanged set raises no fresh toast, a
 * changed set replaces it, and an empty set removes it.
 */
export const createBandNoticeNotifier = ({ add, remove }: ToastDeps) => {
	let lastKey = '';
	let toastId: string | undefined;

	return (notices: string[]) => {
		const key = notices.join('|');
		if (key === lastKey) return;
		lastKey = key;

		if (toastId !== undefined) {
			remove(toastId);
			toastId = undefined;
		}
		if (notices.length === 0) return;

		toastId = add({ type: 'warning', message: notices.join(' '), dismissible: true });
	};
};
