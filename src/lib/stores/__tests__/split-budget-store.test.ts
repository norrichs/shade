import { get } from 'svelte/store';

import { EMPTY_SPLIT_BUDGET, type SplitBudget } from '$lib/cut-pattern/split-budget';
import { splitBudgetStore, splitBudgetWanted } from '../splitBudgetStore';

const budget: SplitBudget = {
	measured: true,
	perPieceFootprint: 4,
	pieceLengthBudget: 96,
	lengthOverflow: true,
	widthBlocked: false
};

describe('splitBudgetStore reader counting', () => {
	test('wants the budget only while something is reading it', () => {
		expect(get(splitBudgetWanted)).toBe(false);

		const stop = splitBudgetStore.subscribe(() => {});
		expect(get(splitBudgetWanted)).toBe(true);

		stop();
		expect(get(splitBudgetWanted)).toBe(false);
	});

	test('clears the stale budget when the last reader leaves', () => {
		const stop = splitBudgetStore.subscribe(() => {});
		splitBudgetStore.set(budget);
		let seen: SplitBudget | undefined;
		splitBudgetStore.subscribe((b) => (seen = b))();
		expect(seen).toEqual(budget);

		stop();

		let after: SplitBudget | undefined;
		const stop2 = splitBudgetStore.subscribe((b) => (after = b));
		expect(after).toEqual(EMPTY_SPLIT_BUDGET);
		stop2();
	});

	test('survives an unsubscriber called twice', () => {
		// Svelte's own store contract allows it, and a component that both runs
		// its effect cleanup and tears down can do it. Counting it twice drove
		// `readers` negative, so the NEXT subscribe reached 0 instead of 1 and the
		// renderer never computed a budget again — Auto-split read "no bands
		// measured" for the rest of the session.
		const stop = splitBudgetStore.subscribe(() => {});
		stop();
		stop();

		const stop2 = splitBudgetStore.subscribe(() => {});
		expect(get(splitBudgetWanted)).toBe(true);
		stop2();
		expect(get(splitBudgetWanted)).toBe(false);
	});

	test('holds the flag while a second reader remains, then drops it', () => {
		const a = splitBudgetStore.subscribe(() => {});
		const b = splitBudgetStore.subscribe(() => {});
		a();
		a();
		expect(get(splitBudgetWanted)).toBe(true);
		b();
		expect(get(splitBudgetWanted)).toBe(false);
	});
});
