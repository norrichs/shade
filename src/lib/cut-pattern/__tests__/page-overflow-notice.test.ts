import { describe, it, expect } from '@jest/globals';

import { createOverflowNotifier, suggestedPageScale } from '../page-overflow-notice';

type CapturedToast = { message: string; action?: { label: string; onClick: () => void } };

const deps = () => {
	const added: CapturedToast[] = [];
	const removed: string[] = [];
	const scales: number[] = [];
	let n = 0;
	return {
		added,
		removed,
		scales,
		add: ((toast: CapturedToast) => {
			added.push(toast);
			return `toast-${++n}`;
		}) as never,
		remove: ((id: string) => {
			removed.push(id);
		}) as never,
		applyScale: ((scale: number) => {
			scales.push(scale);
		}) as never
	};
};

const overflow = (itemIndex: number, requiredScale: number) => ({ itemIndex, requiredScale });

describe('suggestedPageScale', () => {
	it('rounds UP, so "Fit page" cannot land a hair under the required scale', () => {
		expect(suggestedPageScale(1.234561)).toBe(1.2346);
	});
});

describe('createOverflowNotifier', () => {
	it('raises one toast when a pattern overflows', () => {
		const d = deps();
		createOverflowNotifier(d)(overflow(3, 1.5));
		expect(d.added).toHaveLength(1);
		expect(d.added[0].message).toContain('too large to fit the page');
		expect(d.added[0].message).toContain('1.5');
	});

	it('does NOT duplicate when the same overflow is reported again', () => {
		const d = deps();
		const notify = createOverflowNotifier(d);
		notify(overflow(3, 1.5));
		notify(overflow(3, 1.5));
		notify(overflow(3, 1.5));
		expect(d.added).toHaveLength(1);
		expect(d.removed).toHaveLength(0);
	});

	it('replaces the toast rather than stacking a second when the overflow changes', () => {
		const d = deps();
		const notify = createOverflowNotifier(d);
		notify(overflow(3, 1.5));
		notify(overflow(7, 2.25));
		expect(d.added).toHaveLength(2);
		expect(d.removed).toEqual(['toast-1']);
	});

	it('CLEARS the toast when the overflow is resolved — the auto-split case', () => {
		const d = deps();
		const notify = createOverflowNotifier(d);
		notify(overflow(3, 1.5));
		notify(undefined);
		expect(d.removed).toEqual(['toast-1']);
		expect(d.added).toHaveLength(1);
	});

	it('stays quiet while nothing overflows', () => {
		const d = deps();
		const notify = createOverflowNotifier(d);
		notify(undefined);
		notify(undefined);
		expect(d.added).toHaveLength(0);
		expect(d.removed).toHaveLength(0);
	});

	it('raises a fresh toast when a pattern overflows again after being fixed', () => {
		const d = deps();
		const notify = createOverflowNotifier(d);
		notify(overflow(3, 1.5));
		notify(undefined);
		notify(overflow(3, 1.5));
		expect(d.added).toHaveLength(2);
	});

	it('does not try to remove a toast it has already removed', () => {
		const d = deps();
		const notify = createOverflowNotifier(d);
		notify(overflow(3, 1.5));
		notify(undefined);
		notify(undefined);
		expect(d.removed).toEqual(['toast-1']);
	});

	it('offers a Fit page action that applies the rounded-up scale', () => {
		const d = deps();
		createOverflowNotifier(d)(overflow(3, 1.234561));
		expect(d.added[0].action?.label).toBe('Fit page');
		d.added[0].action?.onClick();
		expect(d.scales).toEqual([1.2346]);
	});
});
