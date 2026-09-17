import { writable } from 'svelte/store';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';

export type PartnerHighlightSource = 'projection' | 'surface' | 'globuleTube';

/**
 * The tile editor's partner highlight. Addresses are in PATTERN band space, in
 * parent quad coordinates (`partnerHighlightAddresses`); `partnerHighlightGeometry`
 * maps them onto the real 3D bands of `source`.
 */
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
