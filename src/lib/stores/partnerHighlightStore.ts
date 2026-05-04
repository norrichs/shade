import { writable } from 'svelte/store';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

export type PartnerHighlightSource = 'projection' | 'surface' | 'globuleTube';

export type PartnerHighlight = {
	source: PartnerHighlightSource;
	base: GlobuleAddress_Facet | null;
	top: GlobuleAddress_Facet | null;
	bottom: GlobuleAddress_Facet | null;
	left: GlobuleAddress_Facet | null;
	right: GlobuleAddress_Facet | null;
};

export const partnerHighlightStore = writable<PartnerHighlight>({
	source: 'projection',
	base: null,
	top: null,
	bottom: null,
	left: null,
	right: null
});
