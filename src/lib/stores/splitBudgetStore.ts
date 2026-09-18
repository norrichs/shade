import { writable } from 'svelte/store';

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
export const splitBudgetStore = writable<SplitBudget>(EMPTY_SPLIT_BUDGET);
