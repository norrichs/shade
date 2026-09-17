import type { TubeSplitRejection } from '$lib/types';
import type { Toast } from '$lib/stores/toastStore';

const MAX_LISTED = 5;

/** One summary line for every split generation dropped. */
export const formatDroppedSplitsMessage = (rejections: TubeSplitRejection[]): string => {
	const listed = rejections
		.slice(0, MAX_LISTED)
		.map(({ tube, quad, reason }) => `tube ${tube}, quad ${quad} (${reason})`);
	const more = rejections.length - listed.length;
	if (more > 0) listed.push(`and ${more} more`);
	const count =
		rejections.length === 1 ? '1 split was dropped' : `${rejections.length} splits were dropped`;
	return `${count}: ${listed.join('; ')}. Saved splits are kept and apply again once valid.`;
};

type ToastDeps = {
	add: (toast: Omit<Toast, 'id'>) => string;
	remove: (id: string) => void;
};

/**
 * Keeps at most one "splits dropped" toast in step with the latest pattern
 * result. Pattern generation re-runs on every config change, so an unchanged
 * set of rejections must not raise a fresh toast each time; a changed set
 * replaces the old toast, and an empty set removes it.
 */
export const createDroppedSplitsNotifier = ({ add, remove }: ToastDeps) => {
	let lastKey = '';
	let toastId: string | undefined;

	return (rejections: TubeSplitRejection[] | undefined) => {
		const list = rejections ?? [];
		const key = list.map((r) => `${r.tube}:${r.quad}:${r.reason}`).join('|');
		if (key === lastKey) return;
		lastKey = key;

		if (toastId !== undefined) {
			remove(toastId);
			toastId = undefined;
		}
		if (list.length === 0) return;

		toastId = add({
			type: 'warning',
			message: formatDroppedSplitsMessage(list),
			dismissible: true
		});
	};
};
