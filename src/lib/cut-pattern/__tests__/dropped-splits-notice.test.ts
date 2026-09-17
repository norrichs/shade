import { describe, it, expect, jest } from '@jest/globals';
import { createDroppedSplitsNotifier, formatDroppedSplitsMessage } from '../dropped-splits-notice';
import type { Toast } from '$lib/stores/toastStore';

const outOfRange = { tube: 0, quad: 9, reason: 'out of range for 6 quads' };
const nonMultiple = { tube: 1, quad: 2, reason: 'not a multiple of subunitCount 3' };

const toastDeps = () => {
	let n = 0;
	const add = jest.fn((_toast: Omit<Toast, 'id'>) => `t${++n}`);
	const remove = jest.fn((_id: string) => {});
	return { add, remove };
};

describe('formatDroppedSplitsMessage', () => {
	it('names a single dropped split and says it is still saved', () => {
		expect(formatDroppedSplitsMessage([outOfRange])).toBe(
			'1 split was dropped: tube 0, quad 9 (out of range for 6 quads). Saved splits are kept and apply again once valid.'
		);
	});

	it('summarises several in one message', () => {
		expect(formatDroppedSplitsMessage([outOfRange, nonMultiple])).toBe(
			'2 splits were dropped: tube 0, quad 9 (out of range for 6 quads); tube 1, quad 2 (not a multiple of subunitCount 3). Saved splits are kept and apply again once valid.'
		);
	});

	it('lists at most five and counts the rest', () => {
		const many = [1, 2, 3, 4, 5, 6, 7].map((quad) => ({ tube: 0, quad, reason: 'r' }));
		expect(formatDroppedSplitsMessage(many)).toBe(
			'7 splits were dropped: tube 0, quad 1 (r); tube 0, quad 2 (r); tube 0, quad 3 (r); tube 0, quad 4 (r); tube 0, quad 5 (r); and 2 more. Saved splits are kept and apply again once valid.'
		);
	});
});

describe('createDroppedSplitsNotifier', () => {
	it('raises one warning toast for a set of rejections', () => {
		const deps = toastDeps();
		const notify = createDroppedSplitsNotifier(deps);

		notify([outOfRange, nonMultiple]);

		expect(deps.add).toHaveBeenCalledTimes(1);
		expect(deps.add.mock.calls[0][0]).toMatchObject({
			type: 'warning',
			dismissible: true,
			message: formatDroppedSplitsMessage([outOfRange, nonMultiple])
		});
	});

	it('does nothing when there are no rejections', () => {
		const deps = toastDeps();
		createDroppedSplitsNotifier(deps)([]);
		expect(deps.add).not.toHaveBeenCalled();
	});

	it('does not re-raise for the same rejections on a regeneration', () => {
		const deps = toastDeps();
		const notify = createDroppedSplitsNotifier(deps);
		notify([outOfRange]);
		notify([{ ...outOfRange }]);
		expect(deps.add).toHaveBeenCalledTimes(1);
	});

	it('replaces its toast when the rejections change, and clears it when they go away', () => {
		const deps = toastDeps();
		const notify = createDroppedSplitsNotifier(deps);

		notify([outOfRange]);
		notify([outOfRange, nonMultiple]);
		expect(deps.remove).toHaveBeenCalledWith('t1');
		expect(deps.add).toHaveBeenCalledTimes(2);

		notify([]);
		expect(deps.remove).toHaveBeenLastCalledWith('t2');

		// Coming back after being cleared raises it again.
		notify([outOfRange]);
		expect(deps.add).toHaveBeenCalledTimes(3);
	});
});
