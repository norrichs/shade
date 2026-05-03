import { writable } from 'svelte/store';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

export type PartnerHighlight = {
	start: GlobuleAddress_Facet | null;
	end: GlobuleAddress_Facet | null;
};

export const partnerHighlightStore = writable<PartnerHighlight>({ start: null, end: null });
