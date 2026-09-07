import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { get } from 'svelte/store';

class MemoryStorage {
	private map = new Map<string, string>();
	getItem(k: string) {
		return this.map.has(k) ? this.map.get(k)! : null;
	}
	setItem(k: string, v: string) {
		this.map.set(k, v);
	}
	removeItem(k: string) {
		this.map.delete(k);
	}
	clear() {
		this.map.clear();
	}
	get length() {
		return this.map.size;
	}
	key(i: number) {
		return [...this.map.keys()][i] ?? null;
	}
}

let persistable: typeof import('../persistable').persistable;
let flushPersistable: typeof import('../persistable').flushPersistable;

beforeAll(async () => {
	(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
	({ persistable, flushPersistable } = await import('../persistable'));
});

beforeEach(() => {
	jest.useFakeTimers();
	localStorage.clear();
});
afterEach(() => {
	jest.useRealTimers();
});

const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');

describe('persistable', () => {
	it('updates subscribers synchronously', () => {
		const store = persistable({ n: 0 }, 'Thing', 'test-key', false);
		store.set({ n: 1 });
		expect(get(store)).toEqual({ n: 1 });
	});

	it('debounces the localStorage write and keeps only the latest value', () => {
		const store = persistable({ n: 0 }, 'Thing', 'test-key', false);
		store.set({ n: 1 });
		store.set({ n: 2 });
		expect(stored('test-key')).toBeNull();
		jest.advanceTimersByTime(249);
		expect(stored('test-key')).toBeNull();
		jest.advanceTimersByTime(1);
		expect(stored('test-key')).toEqual({ Thing: { n: 2 } });
	});

	it('merges into the existing persisted object instead of replacing siblings', () => {
		localStorage.setItem('test-key', JSON.stringify({ Other: { keep: true } }));
		const store = persistable({ n: 0 }, 'Thing', 'test-key', false);
		store.set({ n: 5 });
		jest.runAllTimers();
		expect(stored('test-key')).toEqual({ Other: { keep: true }, Thing: { n: 5 } });
	});

	it('flushPersistable writes pending values immediately', () => {
		const a = persistable({ n: 0 }, 'A', 'test-key', false);
		const b = persistable({ m: 0 }, 'B', 'test-key', false);
		a.set({ n: 1 });
		b.set({ m: 2 });
		flushPersistable();
		expect(stored('test-key')).toEqual({ A: { n: 1 }, B: { m: 2 } });
		jest.runAllTimers();
		expect(stored('test-key')).toEqual({ A: { n: 1 }, B: { m: 2 } });
	});

	it('does not log the config on set', () => {
		const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
		const store = persistable({ n: 0 }, 'Thing', 'test-key', false);
		store.set({ n: 1 });
		jest.runAllTimers();
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
