import type { Toast } from '$lib/stores/toastStore';

/** The page-layout overflow report, as the layout algorithms return it. */
export type PageOverflow = { itemIndex: number; requiredScale: number };

/**
 * The `pageScale` to offer, rounded UP.
 *
 * A nearest-rounded value can land a hair under the required scale, which leaves
 * the pattern overflowing and makes "Fit page" look inert.
 */
export const suggestedPageScale = (requiredScale: number): number =>
	Math.ceil(requiredScale * 10000) / 10000;

export const formatOverflowMessage = (suggested: number): string =>
	`A pattern is too large to fit the page. Increase pageScale to ~${suggested} to fit.`;

type OverflowDeps = {
	add: (toast: Omit<Toast, 'id'>) => string;
	remove: (id: string) => void;
	applyScale: (scale: number) => void;
};

/**
 * Keeps at most one "too large to fit the page" toast in step with the latest
 * layout result — the same replace-and-clear shape as
 * `createDroppedSplitsNotifier`, and for the same reasons.
 *
 * The layout re-runs on every view or config change, so:
 *
 * - an unchanged overflow must NOT raise a second toast (it used to stack a new
 *   one every time the offending item or required scale moved, leaving a pile);
 * - an overflow that has been RESOLVED must remove its toast (it used to leave
 *   the old one standing forever, so Auto-split would fix the page and the
 *   alarm would keep claiming it had not — misleading exactly where the fix is
 *   supposed to reassure).
 *
 * "Resolved" is `undefined`, which is what the caller passes when the layout
 * reports no overflow at all.
 */
export const createOverflowNotifier = ({ add, remove, applyScale }: OverflowDeps) => {
	let lastKey = '';
	let toastId: string | undefined;

	return (overflow: PageOverflow | undefined) => {
		const key = overflow ? `${overflow.itemIndex}:${overflow.requiredScale.toFixed(4)}` : '';
		if (key === lastKey) return;
		lastKey = key;

		if (toastId !== undefined) {
			remove(toastId);
			toastId = undefined;
		}
		if (!overflow) return;

		const suggested = suggestedPageScale(overflow.requiredScale);
		toastId = add({
			type: 'error',
			message: formatOverflowMessage(suggested),
			dismissible: true,
			action: { label: 'Fit page', onClick: () => applyScale(suggested) }
		});
	};
};
