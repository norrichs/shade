import { get } from 'svelte/store';
import {
	labelTextDimensions,
	setLabelTextDimension,
	flushLabelTextDimensions
} from '../mergedPathStore';

beforeEach(() => {
	labelTextDimensions.set(new Map());
});

describe('setLabelTextDimension', () => {
	it('coalesces many writes into one store update', async () => {
		let updates = 0;
		const unsub = labelTextDimensions.subscribe(() => updates++);
		updates = 0;
		for (let i = 0; i < 50; i++) setLabelTextDimension(`b${i}`, { width: i, height: 1 });
		expect(updates).toBe(0);
		await Promise.resolve();
		expect(updates).toBe(1);
		expect(get(labelTextDimensions).size).toBe(50);
		expect(get(labelTextDimensions).get('b7')).toEqual({ width: 7, height: 1 });
		unsub();
	});

	it('does not emit when the measured dims are unchanged', async () => {
		setLabelTextDimension('a', { width: 10, height: 2 });
		flushLabelTextDimensions();
		let updates = 0;
		const unsub = labelTextDimensions.subscribe(() => updates++);
		updates = 0;
		setLabelTextDimension('a', { width: 10, height: 2 });
		flushLabelTextDimensions();
		expect(updates).toBe(0);
		unsub();
	});

	it('keeps the last write for a band within one batch', () => {
		setLabelTextDimension('a', { width: 1, height: 1 });
		setLabelTextDimension('a', { width: 3, height: 3 });
		flushLabelTextDimensions();
		expect(get(labelTextDimensions).get('a')).toEqual({ width: 3, height: 3 });
	});

	it('preserves entries for other bands', () => {
		labelTextDimensions.set(new Map([['keep', { width: 9, height: 9 }]]));
		setLabelTextDimension('a', { width: 1, height: 1 });
		flushLabelTextDimensions();
		expect(get(labelTextDimensions).get('keep')).toEqual({ width: 9, height: 9 });
	});
});
