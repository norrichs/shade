import { describe, it, expect } from '@jest/globals';
import { createOrderedSender } from '../ordered-sender';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createOrderedSender', () => {
	it('posts a loading request before a later non-loading one', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const sent: number[] = [];
		const sender = createOrderedSender<number>((c) => (c === 1 ? gate : undefined));
		sender(1, () => sent.push(1));
		sender(2, () => sent.push(2));
		expect(sent).toEqual([]);
		release();
		await tick();
		expect(sent).toEqual([1, 2]);
	});

	it('sends synchronously when nothing is queued and nothing loads', () => {
		const sent: number[] = [];
		const sender = createOrderedSender<number>(() => undefined);
		sender(1, () => sent.push(1));
		expect(sent).toEqual([1]);
	});

	it('returns to the synchronous path once the queue drains', async () => {
		const sent: number[] = [];
		const sender = createOrderedSender<number>((c) => (c === 1 ? Promise.resolve() : undefined));
		sender(1, () => sent.push(1));
		expect(sent).toEqual([]);
		await tick();
		expect(sent).toEqual([1]);
		sender(2, () => sent.push(2));
		expect(sent).toEqual([1, 2]);
	});
});
