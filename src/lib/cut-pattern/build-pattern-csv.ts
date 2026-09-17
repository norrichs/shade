import type { BandSortIndex, TubeCutPattern, BandRef as GlobuleAddress_Band } from '$lib/types';
import { buildBandCodeMap } from './band-sort-index';
import { bandKey } from './band-key';
import {
	adjacentParentBands,
	buildTubePieceIndex,
	endPartnerPieceAddress,
	neighbourPiecesAlongside,
	parentBandsOf,
	type TubePieceIndex
} from './band-piece-index';
import type { GlobuleAddress_BandPiece } from '$lib/projection-geometry/types';
import { concatAddress } from '$lib/util';

/**
 * Display form for an address. Globule omitted per spec `t{tube}/b{band}`; a
 * piece appends `p{piece}` (`t0/b1p0`), the same form as the band's self tag.
 */
const formatBandAddress = (a: GlobuleAddress_Band | GlobuleAddress_BandPiece): string =>
	concatAddress(a, 'tb-slash');

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

type BandAddress = GlobuleAddress_Band | GlobuleAddress_BandPiece;
type Band = TubeCutPattern['bands'][number];

/**
 * Per-call lookup over every tube: tube by (globule, tube), and each tube's
 * bands grouped by parent with their parent-quad ranges. Built once per CSV in
 * O(bands + facets), so each row's lookups touch only neighbouring parents.
 */
type CsvLookup = {
	tube: (address: BandAddress) => TubeCutPattern | undefined;
	index: (tube: TubeCutPattern) => TubePieceIndex<Band>;
};

const buildCsvLookup = (tubes: TubeCutPattern[]): CsvLookup => {
	const tubeKey = (a: { globule: number; tube: number }) => `${a.globule}:${a.tube}`;
	const byKey = new Map<string, TubeCutPattern>();
	// First tube wins, matching the `tubes.find` this replaces.
	for (const t of tubes) if (!byKey.has(tubeKey(t.address))) byKey.set(tubeKey(t.address), t);
	const indexes = new Map<TubeCutPattern, TubePieceIndex<Band>>();
	return {
		tube: (address) => byKey.get(tubeKey(address)),
		index: (t) => {
			let index = indexes.get(t);
			if (!index) {
				index = buildTubePieceIndex(t.bands);
				indexes.set(t, index);
			}
			return index;
		}
	};
};

/**
 * Within-tube adjacency: the side-neighbour bands before and after this band in
 * the SAME tube, i.e. its parent band ± 1 (no wrap), matching
 * `buildTubeOrderIndex` ordering. The facet-level `meta.ab/ac.partner` data is
 * not present on `BandCutPattern`, so adjacency is structural by design.
 *
 * Every neighbour piece the band borders along its length is listed, in piece
 * order (spec amendment "Labels name the physical piece"): those whose
 * parent-quad range overlaps the band's own. An unsplit neighbour is listed as
 * itself. A piece's seam sibling is NOT an adjacent band: it joins end to end
 * and is listed among the end partners instead.
 */
const withinTubeAdjacentPartners = (address: BandAddress, lookup: CsvLookup): BandAddress[] => {
	const tube = lookup.tube(address);
	if (!tube) return [];
	const index = lookup.index(tube);
	const self = parentBandsOf(index, address)?.find((b) => bandKey(b.address) === bandKey(address));
	if (!self) return [];
	return ([-1, 1] as const).flatMap((step) => {
		const neighbour = adjacentParentBands(index, address, step, false);
		return neighbour ? neighbourPiecesAlongside(index, neighbour, self).map((b) => b.address) : [];
	});
};

/**
 * End-partner addresses naming the physical part each end meets, deduped,
 * missing entries omitted. A seam names its sibling piece; an outer partner is
 * resolved by the end-partner rule (`endPartnerPieceAddress`).
 */
const endPartnerAddresses = (band: Band, lookup: CsvLookup): BandAddress[] => {
	const partsOf = (address: BandAddress) => {
		const tube = lookup.tube(address);
		return tube && parentBandsOf(lookup.index(tube), address);
	};
	const partners = (['start', 'end'] as const)
		.map((end) => endPartnerPieceAddress(band, end, partsOf))
		.filter((p) => p !== undefined);
	const seen = new Set<string>();
	return partners.filter((p) => {
		const k = bandKey(p);
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
};

const buildTubeOrderCsv = (tubes: TubeCutPattern[]): string => {
	const lookup = buildCsvLookup(tubes);
	const rows: string[] = ['band,adjacent,endPartners'];
	for (const tube of tubes) {
		for (const band of tube.bands) {
			const self = csvCell(formatBandAddress(band.address));
			const adjacent = multiCell(
				withinTubeAdjacentPartners(band.address, lookup).map(formatBandAddress)
			);
			const ends = multiCell(endPartnerAddresses(band, lookup).map(formatBandAddress));
			rows.push(`${self},${adjacent},${ends}`);
		}
	}
	return rows.join('\n');
};

const buildEndConnectionCsv = (index: BandSortIndex, tubes: TubeCutPattern[]): string => {
	const codeMap = buildBandCodeMap(index);
	const lookup = buildCsvLookup(tubes);
	const rows: string[] = ['ringCode,partnerRingCodes,members'];

	for (const group of index.groups) {
		const ringCode = group.code ?? '';

		// Collect partner ring codes: for every member, find its within-tube
		// adjacent partners, map each to its ring code via codeMap, dedupe, and
		// exclude this ring's own code.
		const partnerCodes = new Set<string>();
		for (const member of group.bands) {
			for (const adj of withinTubeAdjacentPartners(member, lookup)) {
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
