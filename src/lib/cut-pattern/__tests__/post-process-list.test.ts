import { describe, it, expect } from '@jest/globals';
import {
	addPostProcess,
	deletePostProcess,
	movePostProcess,
	postProcessLabel,
	postProcessList,
	splitPostProcessList,
	stackPageGroups
} from '../post-process-list';
import { DEFAULT_POST_PROCESS, type PostProcessConfig } from '../hole-drop-config';

const pp = (runSeed: number, extra: Partial<PostProcessConfig> = {}): PostProcessConfig => ({
	dropHoles: { mode: 'none' },
	runSeed,
	...extra
});

describe('postProcessList', () => {
	it('is the first config alone when there are no extras', () => {
		expect(postProcessList({ postProcess: pp(1) })).toEqual([pp(1)]);
	});

	it('defaults a missing first config', () => {
		expect(postProcessList({})).toEqual([DEFAULT_POST_PROCESS]);
		expect(postProcessList(undefined)).toEqual([DEFAULT_POST_PROCESS]);
	});

	it('appends the extras in order', () => {
		expect(
			postProcessList({ postProcess: pp(1), additionalPostProcesses: [pp(2), pp(3)] })
		).toEqual([pp(1), pp(2), pp(3)]);
	});
});

describe('splitPostProcessList', () => {
	it('keeps export settings on the first entry after a move', () => {
		const first = pp(1, { layerMap: { 'pattern-hole': 'T2' }, downloadFormat: 'lbrn2' });
		const moved = movePostProcess([first, pp(2)], 0, 1);
		const stored = splitPostProcessList(moved, first);

		expect(stored.postProcess).toEqual(
			pp(2, { layerMap: { 'pattern-hole': 'T2' }, downloadFormat: 'lbrn2' })
		);
		expect(stored.additionalPostProcesses).toEqual([pp(1)]);
	});

	it('strips export settings from the extras', () => {
		const stored = splitPostProcessList([pp(1), pp(2, { downloadFormat: 'lbrn2' })], pp(1));
		expect(stored.additionalPostProcesses).toEqual([pp(2)]);
	});
});

describe('list operations', () => {
	it('duplicates after the source, dropping the name', () => {
		const list = addPostProcess([pp(1, { name: 'cut' }), pp(2)], 0);
		expect(list).toEqual([pp(1, { name: 'cut' }), pp(1), pp(2)]);
	});

	it('deep-copies the duplicate', () => {
		const source = pp(1, { pageLabel: { pageNumber: true, configName: false, text: '' } });
		const [, copy] = addPostProcess([source], 0);
		copy.pageLabel!.text = 'changed';
		expect(source.pageLabel!.text).toBe('');
	});

	it('will not delete the last config', () => {
		const list = [pp(1)];
		expect(deletePostProcess(list, 0)).toBe(list);
		expect(deletePostProcess([pp(1), pp(2)], 0)).toEqual([pp(2)]);
	});

	it('moves within bounds only', () => {
		const list = [pp(1), pp(2)];
		expect(movePostProcess(list, 0, -1)).toBe(list);
		expect(movePostProcess(list, 1, 1)).toBe(list);
		expect(movePostProcess(list, 1, -1)).toEqual([pp(2), pp(1)]);
	});
});

describe('postProcessLabel', () => {
	it('uses the name when set, else the position', () => {
		expect(postProcessLabel(pp(0, { name: ' holes ' }), 0)).toBe('holes');
		expect(postProcessLabel(pp(0, { name: '' }), 2)).toBe('PP3');
		expect(postProcessLabel(undefined, 0)).toBe('PP1');
	});
});

describe('stackPageGroups', () => {
	const pages = [
		{ x: 0, y: 0, width: 100, height: 200 },
		{ x: 120, y: 0, width: 100, height: 200 }
	];

	it('returns the pages unchanged for one group', () => {
		expect(stackPageGroups(pages, 1).pages).toEqual(pages);
	});

	it('stacks each group below the last with a gap', () => {
		const { stride, pages: all } = stackPageGroups(pages, 3);
		expect(stride).toBe(250);
		expect(all).toHaveLength(6);
		expect(all.map((p) => p.y)).toEqual([0, 0, 250, 250, 500, 500]);
		expect(all.map((p) => p.x)).toEqual([0, 120, 0, 120, 0, 120]);
	});

	it('handles no pages', () => {
		expect(stackPageGroups([], 2)).toEqual({ stride: 0, pages: [] });
	});
});
