import { writable, type Subscriber, type Unsubscriber } from 'svelte/store';

import { EMPTY_SPLIT_BUDGET, type SplitBudget } from '$lib/cut-pattern/split-budget';

/**
 * The per-piece length budget and overflow preconditions the Splits panel needs,
 * published by `CutPatternRenderer` because only it has the effective bounds the
 * layout actually measures (`buildEffectiveBoundsIndex`).
 *
 * Published rather than recomputed in the panel for the same reason
 * `collatedTubesStore` exists: a second site building the four-input bounds
 * context could disagree with the renderer about what overflows, and the panel
 * would then offer or refuse Auto-split against numbers the layout never used.
 * It is written behind a value-key guard, so a render pass that changes nothing
 * does not write the store and cannot re-enter the reactive flush.
 */
const inner = writable<SplitBudget>(EMPTY_SPLIT_BUDGET);

/**
 * True only while something is actually reading the budget.
 *
 * Computing it is an O(bands) pass over EVERY collated band, including bands
 * outside the rendered range, whose effective bounds are not in the render
 * pass's index and so must be built on the spot. The pattern pane has a history
 * of render-cascade stalls, so that pass is not run when the Splits panel is
 * closed — which is almost always. The renderer reads this flag and skips the
 * work; opening the panel subscribes, flips the flag, and the budget is computed
 * on the next pass.
 */
export const splitBudgetWanted = writable(false);

let readers = 0;

export const splitBudgetStore = {
	set: inner.set,
	subscribe: (run: Subscriber<SplitBudget>, invalidate?: () => void): Unsubscriber => {
		readers += 1;
		if (readers === 1) splitBudgetWanted.set(true);
		const stop = inner.subscribe(run, invalidate);
		// Calling an unsubscriber twice is allowed by the store contract and a
		// component that both runs an effect cleanup and tears down will do it.
		// Counted twice, `readers` went negative and the NEXT subscribe reached 0
		// instead of 1, so `splitBudgetWanted` never went true again and the
		// renderer never computed another budget: Auto-split read "no bands
		// measured" for the rest of the session. `done` makes the unsubscriber
		// idempotent; the clamp keeps the count sane even so.
		let done = false;
		return () => {
			if (done) return;
			done = true;
			stop();
			readers = Math.max(0, readers - 1);
			if (readers === 0) {
				splitBudgetWanted.set(false);
				// Do not leave a stale budget behind for the next reader to act on
				// before the renderer has published a fresh one.
				inner.set(EMPTY_SPLIT_BUDGET);
			}
		};
	}
};
