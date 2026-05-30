import type { BandSortIndex, BandSortMode, BandSortGroup, BandRef, IndexRange, TubeCutPattern } from '$lib/types';

const bandKey = (ref: BandRef): string => `${ref.globule}-${ref.tube}-${ref.band}`;

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

	const walkRing = (startRef: BandRef): BandRef[] => {
		const ring: BandRef[] = [];
		let current: BandRef = startRef;

		while (true) {
			const key = bandKey(current);
			if (ring.length > 0 && key === bandKey(startRef)) break;
			if (claimed.has(key)) break;

			claimed.add(key);
			ring.push(current);

			const band = bandLookup.get(key);
			if (!band?.meta?.endPartnerBand) break;
			current = band.meta.endPartnerBand;
		}

		return ring;
	};

	let ringIndex = 0;
	for (const tube of tubes) {
		for (const band of tube.bands) {
			const key = bandKey(band.address);
			if (claimed.has(key)) continue;

			const ring = walkRing(band.address);
			if (ring.length > 0) {
				groups.push({ label: `Ring ${ringIndex}`, bands: ring });
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
