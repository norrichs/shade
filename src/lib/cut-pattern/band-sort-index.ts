import type {
	BandSortIndex,
	BandSortMode,
	BandSortGroup,
	BandRef,
	IndexRange,
	TubeCutPattern
} from '$lib/types';
import { isGlobuleAddress_BandPiece, isSameParentBand } from '$lib/util';
import { bandKey } from './band-key';
import { pieceIndexOf, resolveEndPartner, type BandEnd } from './resolve-partner-band';

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
 *   partner's ends joins (`resolveEndPartner`): its piece 0 if its start meets
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

	// `resolveEndPartner` looks tubes up by position (`tubes[address.tube]`), but
	// the tubes handed to the sort index are collated and need not sit at their
	// tube index. Re-seat every band at its own tube index. Merging globules that
	// share a tube index is safe: the resolver matches the full parent address.
	const byTubeIndex: TubeCutPattern[] = [];
	for (const tube of tubes) {
		for (const band of tube.bands) {
			const t = band.address.tube;
			byTubeIndex[t] ??= { ...tube, bands: [] };
			byTubeIndex[t].bands.push(band);
		}
	}

	const resolveEnd = (band: TubeCutPattern['bands'][number], end: BandEnd): BandRef | undefined => {
		const stored = end === 'start' ? band.meta?.startPartnerBand : band.meta?.endPartnerBand;
		if (!stored) return undefined;
		const resolved = resolveEndPartner(byTubeIndex, band, end)?.band.address;
		return resolved && isGlobuleAddress_BandPiece(resolved) ? resolved : stored;
	};

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
 * Put each split band's pieces together, in piece order, within a ring.
 *
 * The walk already keeps a band's pieces contiguous, since they are chained by
 * their seams, but lists them in whichever direction it crossed the band, and in
 * a cycle it splits the starting band's pieces across the two ends of the list
 * (the walk leaves by the first piece's outer start and returns by the last
 * piece's outer end). Rotate that trailing run to the front, then sort each run
 * of one parent's pieces. An unsplit ring has no two consecutive refs with the
 * same parent, so it is returned unchanged.
 */
const orderPiecesInRing = (ring: BandRef[]): BandRef[] => {
	if (ring.length < 2) return ring;
	let ordered = ring;
	if (!ring.every((r) => isSameParentBand(r, ring[0]))) {
		let tail = ring.length;
		while (tail > 0 && isSameParentBand(ring[tail - 1], ring[0])) tail--;
		ordered = [...ring.slice(tail), ...ring.slice(0, tail)];
	}
	const result: BandRef[] = [];
	let runStart = 0;
	for (let i = 1; i <= ordered.length; i++) {
		if (i < ordered.length && isSameParentBand(ordered[i], ordered[runStart])) continue;
		const run = ordered.slice(runStart, i);
		if (run.length > 1) run.sort((x, y) => pieceIndexOf(x) - pieceIndexOf(y));
		result.push(...run);
		runStart = i;
	}
	return result;
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
