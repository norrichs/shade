import type { BandSortIndex, BandSortMode, BandSortGroup, BandRef, IndexRange, TubeCutPattern } from '$lib/types';

const bandKey = (ref: BandRef): string => `${ref.globule}-${ref.tube}-${ref.band}`;

export const formatGroupCode = (n: number): string => String(n).padStart(4, '0');

const buildTubeOrderIndex = (tubes: TubeCutPattern[]): BandSortIndex => ({
	mode: 'tube-order',
	groups: tubes.map((tube, t) => ({
		label: `Tube ${t}`,
		bands: tube.bands.map((band) => band.address)
	}))
});

const buildEndConnectionIndex = (tubes: TubeCutPattern[]): BandSortIndex => {
	const claimed = new Set<string>();
	const groups: BandSortGroup[] = [];

	const bandLookup = new Map<string, TubeCutPattern['bands'][number]>();
	for (const tube of tubes) {
		for (const band of tube.bands) {
			bandLookup.set(bandKey(band.address), band);
		}
	}

	// A band connects to neighbours at BOTH of its ends: `startPartnerBand` and
	// `endPartnerBand`. Treat those as undirected edges (each band has at most one
	// partner per end, so degree <= 2 — the connected component is a simple path or
	// cycle). Walking only `endPartnerBand` (the previous behaviour) dropped any
	// band linked solely through the start end, so a member with two end partners
	// only surfaced one of them.
	const neighboursOf = (ref: BandRef): BandRef[] => {
		const meta = bandLookup.get(bandKey(ref))?.meta;
		return [meta?.startPartnerBand, meta?.endPartnerBand].filter((p): p is BandRef => !!p);
	};

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
				groups.push({ label: `Ring ${ringIndex}`, code: formatGroupCode(ringIndex), bands: ring });
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
