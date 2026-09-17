import type {
	BandSortIndex,
	BandSortMode,
	BandSortGroup,
	BandRef,
	IndexRange,
	TubeCutPattern
} from '$lib/types';
import { isSameParentBand } from '$lib/util';
import { bandKey } from './band-key';
import { pieceIndexOf, type BandEnd } from './resolve-partner-band';
import {
	buildTubePieceIndex,
	endPartnerPieceAddress,
	parentBandsOf,
	type TubePieceIndex
} from './band-piece-index';

export const formatGroupCode = (n: number): string => String(n).padStart(4, '0');

const buildTubeOrderIndex = (tubes: TubeCutPattern[]): BandSortIndex => ({
	mode: 'tube-order',
	groups: tubes.map((tube, t) => ({
		label: `Tube ${t}`,
		bands: tube.bands.map((band) => band.address)
	}))
});

/**
 * The end-connection neighbours of a band or piece: what its start and its end
 * meet, as refs that name bands in `tubes` exactly (pieces included).
 *
 * - A seam (a piece-bearing stored partner) is its sibling piece, exactly.
 * - An outer end (a plain stored partner) is resolved by which of the
 *   partner's ends joins (`endPartnerPieceAddress`): its piece 0 if its start meets
 *   this band, else its last piece. An unsplit partner resolves to itself.
 *
 * When the stored partner resolves to an unsplit band, or to nothing (it is
 * absent from `tubes`), the stored address is returned as it always was, so an
 * unsplit index is unchanged ref for ref.
 */
export const createEndConnectionNeighbours = (
	tubes: TubeCutPattern[]
): ((ref: BandRef) => BandRef[]) => {
	const bandLookup = new Map<string, TubeCutPattern['bands'][number]>();
	for (const tube of tubes) {
		for (const band of tube.bands) {
			bandLookup.set(bandKey(band.address), band);
		}
	}

	// The partner's parts are looked up by its own tube index, but the tubes
	// handed to the sort index are collated and need not sit at their tube
	// index. Re-seat every band at its own tube index. Merging globules that
	// share a tube index is safe: the piece index keys parents by their full
	// address.
	const byTubeIndex: TubeCutPattern[] = [];
	for (const tube of tubes) {
		for (const band of tube.bands) {
			const t = band.address.tube;
			byTubeIndex[t] ??= { ...tube, bands: [] };
			byTubeIndex[t].bands.push(band);
		}
	}
	type Band = TubeCutPattern['bands'][number];
	const indexes = new Map<number, TubePieceIndex<Band>>();
	const partsOf = (address: BandRef) => {
		const tube = byTubeIndex[address.tube];
		if (!tube) return undefined;
		let index = indexes.get(address.tube);
		if (!index) {
			index = buildTubePieceIndex(tube.bands);
			indexes.set(address.tube, index);
		}
		return parentBandsOf(index, address);
	};

	// The end-partner rule shared with labels and the CSV: a seam names its
	// sibling exactly; an outer end resolves to the partner's piece 0 or last
	// piece, or stays the stored address when the partner is unsplit or absent.
	const resolveEnd = (band: Band, end: BandEnd): BandRef | undefined =>
		endPartnerPieceAddress(band, end, partsOf);

	// A band connects to neighbours at BOTH of its ends: `startPartnerBand` and
	// `endPartnerBand`. Treat those as undirected edges (each band has at most one
	// partner per end, so degree <= 2 — the connected component is a simple path or
	// cycle). Walking only `endPartnerBand` (the previous behaviour) dropped any
	// band linked solely through the start end, so a member with two end partners
	// only surfaced one of them.
	return (ref: BandRef): BandRef[] => {
		const band = bandLookup.get(bandKey(ref));
		if (!band) return [];
		return [resolveEnd(band, 'start'), resolveEnd(band, 'end')].filter((p): p is BandRef => !!p);
	};
};

/**
 * Keep a ring in walk order, which lists physically joined bands next to each
 * other, while presenting each split band's pieces together and ascending.
 *
 * The walk already keeps a band's pieces contiguous, since their seams chain
 * them. In a cycle, though, it splits the starting band's pieces across the two
 * ends of the list: it leaves by the first piece's outer start and comes back by
 * the last piece's outer end. Rotating that trailing run to the front joins them
 * up, and the wrap from last to first is still a physical join.
 *
 * Pieces are never sorted on their own, because that would break the joins on a
 * band the walk crossed end→start. `walkRing` puts the start partner first, so
 * in a consistently oriented ring every band is crossed that way and its pieces
 * come out descending. When descending split runs outnumber ascending ones, the
 * whole ring is reversed instead. The pieces then read ascending and every
 * neighbouring pair stays joined.
 *
 * A ring without a split band has no two consecutive refs sharing a parent, so
 * neither step applies and it is returned unchanged.
 */
const orderPiecesInRing = (ring: BandRef[]): BandRef[] => {
	if (ring.length < 2) return ring;
	let ordered = ring;
	if (!ring.every((r) => isSameParentBand(r, ring[0]))) {
		let tail = ring.length;
		while (tail > 0 && isSameParentBand(ring[tail - 1], ring[0])) tail--;
		ordered = [...ring.slice(tail), ...ring.slice(0, tail)];
	}
	let ascending = 0;
	let descending = 0;
	for (let i = 1; i < ordered.length; i++) {
		if (!isSameParentBand(ordered[i - 1], ordered[i])) continue;
		if (pieceIndexOf(ordered[i]) > pieceIndexOf(ordered[i - 1])) ascending++;
		else descending++;
	}
	return descending > ascending ? [...ordered].reverse() : ordered;
};

const buildEndConnectionIndex = (tubes: TubeCutPattern[]): BandSortIndex => {
	const claimed = new Set<string>();
	const groups: BandSortGroup[] = [];
	const neighboursOf = createEndConnectionNeighbours(tubes);

	// Walk one direction from `first` (arriving from `cameFromKey`), following the
	// single not-yet-seen neighbour at each step. `claimed` guards against cycles.
	const walkChain = (first: BandRef, cameFromKey: string): BandRef[] => {
		const chain: BandRef[] = [];
		let current: BandRef | undefined = first;
		let prevKey = cameFromKey;
		while (current) {
			const key = bandKey(current);
			if (claimed.has(key)) break;
			claimed.add(key);
			chain.push(current);
			const next = neighboursOf(current).find((n) => {
				const nk = bandKey(n);
				return nk !== prevKey && !claimed.has(nk);
			});
			prevKey = key;
			current = next;
		}
		return chain;
	};

	const walkRing = (startRef: BandRef): BandRef[] => {
		const startKey = bandKey(startRef);
		if (claimed.has(startKey)) return [];
		claimed.add(startKey);

		// Walk both sides of the start band so the whole ring/chain is captured,
		// then splice them around the start in linear order.
		const [sideA, sideB] = neighboursOf(startRef);
		const right = sideA ? walkChain(sideA, startKey) : [];
		const left = sideB ? walkChain(sideB, startKey) : [];
		return [...left.reverse(), startRef, ...right];
	};

	let ringIndex = 0;
	for (const tube of tubes) {
		for (const band of tube.bands) {
			const key = bandKey(band.address);
			if (claimed.has(key)) continue;

			const ring = walkRing(band.address);
			if (ring.length > 0) {
				groups.push({
					label: `Ring ${ringIndex}`,
					code: formatGroupCode(ringIndex),
					bands: orderPiecesInRing(ring)
				});
				ringIndex++;
			}
		}
	}

	return { mode: 'end-connection-tube', groups };
};

export const buildBandSortIndex = (tubes: TubeCutPattern[], mode: BandSortMode): BandSortIndex => {
	switch (mode) {
		case 'tube-order':
			return buildTubeOrderIndex(tubes);
		case 'end-connection-tube':
			return buildEndConnectionIndex(tubes);
	}
};

export const sliceBandSortIndex = (index: BandSortIndex, range: IndexRange): BandSortIndex => {
	const groupStart = range.groups?.[0] ?? 0;
	const groupEnd = range.groups?.[1] ?? index.groups.length;
	const slicedGroups = index.groups.slice(groupStart, groupEnd);

	if (!range.bandsInGroup) return { ...index, groups: slicedGroups };

	const [bandStart, bandEnd] = range.bandsInGroup;
	return {
		...index,
		groups: slicedGroups.map((group) => ({
			...group,
			bands: group.bands.slice(bandStart, bandEnd)
		}))
	};
};

export const buildBandCodeMap = (index: BandSortIndex): Map<string, string> => {
	const map = new Map<string, string>();
	for (const group of index.groups) {
		if (group.code === undefined) continue;
		for (const ref of group.bands) map.set(bandKey(ref), group.code);
	}
	return map;
};
