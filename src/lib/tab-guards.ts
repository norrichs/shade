// Shared FacetTab type guards.
//
// Kept in a tiny standalone module (importing only types) so consumers like
// collect-band-tabs can use them without dragging in generate-shape.ts —
// which transitively reaches into cut-pattern code that Jest's transform
// pipeline doesn't handle (three/src submodules, etc.).
import type {
	FacetTab,
	FullTab,
	MultiFacetFullTab,
	MultiFacetTrapTab,
	TrapTab
} from '$lib/types';

export const isFullTab = (tab: FacetTab | FacetTab[] | undefined): tab is FullTab =>
	!Array.isArray(tab) && tab?.style === 'full';

export const isTrapTab = (tab: FacetTab | FacetTab[] | undefined): tab is TrapTab =>
	!Array.isArray(tab) && tab?.style === 'trapezoid';

export const isMultiFacetFullTab = (
	tab: FacetTab | FacetTab[] | undefined
): tab is MultiFacetFullTab => !Array.isArray(tab) && tab?.style === 'multi-facet-full';

export const isMultiFacetTrapTab = (
	tab: FacetTab | FacetTab[] | undefined
): tab is MultiFacetTrapTab => !Array.isArray(tab) && tab?.style === 'multi-facet-trapezoid';
