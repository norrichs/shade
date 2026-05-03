import { writable } from 'svelte/store';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

export type PartnerHighlightSource = 'projection' | 'surface' | 'globuleTube';

export type PartnerHighlight = {
	source: PartnerHighlightSource;
	start: GlobuleAddress_Facet | null;
	end: GlobuleAddress_Facet | null;
};

export const partnerHighlightStore = writable<PartnerHighlight>({
	source: 'projection',
	start: null,
	end: null
});
