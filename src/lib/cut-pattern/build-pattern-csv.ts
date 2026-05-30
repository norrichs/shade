import type { BandSortIndex, TubeCutPattern, GlobuleAddress_Band } from '$lib/types';
import { buildBandCodeMap } from './band-sort-index';

/** Local key builder. WS-B's `bandKey` is module-private; we mirror its shape. */
const bandKey = (a: GlobuleAddress_Band): string => `${a.globule}-${a.tube}-${a.band}`;

/** Display form for an address. Globule omitted per spec `t{tube}/b{band}`. */
const formatBandAddress = (a: GlobuleAddress_Band): string => `t${a.tube}/b${a.band}`;

/**
 * RFC 4180-aligned cell encoder. Quotes the field iff it contains a comma,
 * double-quote, space, or line break; doubles embedded quotes. Multi-value
 * cells (joined by spaces) are therefore always quoted, keeping the list in
 * one column.
 */
const csvCell = (value: string): string => {
	if (/[",\s]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
};

/** Join multiple display values into one space-separated cell. */
const multiCell = (values: string[]): string => csvCell(values.join(' '));

/**
 * Within-tube adjacency: the before/after neighbor bands in the SAME tube
 * (index +/- 1 of the band's position in `TubeCutPattern.bands`). This matches
 * `buildTubeOrderIndex` ordering. The facet-level `meta.ab/ac.partner` data is
 * not present on `BandCutPattern`, so adjacency is structural by design.
 */
const withinTubeAdjacentPartners = (
	address: GlobuleAddress_Band,
	tubes: TubeCutPattern[]
): GlobuleAddress_Band[] => {
	const tube = tubes.find(
		(t) => t.address.globule === address.globule && t.address.tube === address.tube
	);
	if (!tube) return [];
	const i = tube.bands.findIndex((b) => bandKey(b.address) === bandKey(address));
	if (i < 0) return [];
	const out: GlobuleAddress_Band[] = [];
	if (i - 1 >= 0) out.push(tube.bands[i - 1].address);
	if (i + 1 < tube.bands.length) out.push(tube.bands[i + 1].address);
	return out;
};

/**
 * End-partner addresses from `meta.startPartnerBand`/`endPartnerBand`,
 * deduped, missing entries omitted.
 */
const endPartnerAddresses = (band: TubeCutPattern['bands'][number]): GlobuleAddress_Band[] => {
	const partners: GlobuleAddress_Band[] = [];
	if (band.meta?.startPartnerBand) partners.push(band.meta.startPartnerBand);
	if (band.meta?.endPartnerBand) partners.push(band.meta.endPartnerBand);
	const seen = new Set<string>();
	return partners.filter((p) => {
		const k = bandKey(p);
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
};

const buildTubeOrderCsv = (tubes: TubeCutPattern[]): string => {
	const rows: string[] = ['band,adjacent,endPartners'];
	for (const tube of tubes) {
		for (const band of tube.bands) {
			const self = csvCell(formatBandAddress(band.address));
			const adjacent = multiCell(
				withinTubeAdjacentPartners(band.address, tubes).map(formatBandAddress)
			);
			const ends = multiCell(endPartnerAddresses(band).map(formatBandAddress));
			rows.push(`${self},${adjacent},${ends}`);
		}
	}
	return rows.join('\n');
};

const buildEndConnectionCsv = (index: BandSortIndex, tubes: TubeCutPattern[]): string => {
	const codeMap = buildBandCodeMap(index);
	const rows: string[] = ['ringCode,partnerRingCodes,members'];

	for (const group of index.groups) {
		const ringCode = group.code ?? '';

		// Collect partner ring codes: for every member, find its within-tube
		// adjacent partners, map each to its ring code via codeMap, dedupe, and
		// exclude this ring's own code.
		const partnerCodes = new Set<string>();
		for (const member of group.bands) {
			for (const adj of withinTubeAdjacentPartners(member, tubes)) {
				const code = codeMap.get(bandKey(adj));
				if (code && code !== ringCode) partnerCodes.add(code);
			}
		}

		const members = group.bands.map((b) => csvCell(formatBandAddress(b)));
		const cells = [csvCell(ringCode), multiCell([...partnerCodes]), ...members];
		rows.push(cells.join(','));
	}

	return rows.join('\n');
};

/** PURE: build a relationship-map CSV string for the active sort mode. */
export const buildPatternCsv = (index: BandSortIndex, tubes: TubeCutPattern[]): string => {
	switch (index.mode) {
		case 'tube-order':
			return buildTubeOrderCsv(tubes);
		case 'end-connection-tube':
			return buildEndConnectionCsv(index, tubes);
	}
};
