import type {
	GeometryAddress,
	BandAddressed,
	GlobuleAddressed,
	Id,
	BandConfigCoordinates,
	GlobuleConfigCoordinates,
	Facet,
	SuperGlobule
} from '$lib/types';
import { derived, writable } from 'svelte/store';
import {
	superConfigStore,
	superGlobulePatternStore,
	superGlobuleStore
} from './superGlobuleStores';
import type {
	GlobuleAddress_Band,
	GlobuleAddress_Facet,
	GlobuleAddress_Tube
} from '$lib/projection-geometry/types';
import { BufferGeometry } from 'three';
import {
	concatAddress_Band,
	concatAddress_Tube,
	concatAddress,
	concatAddress_Facet,
	isGlobuleAddress_Band,
	isGlobuleAddress_Facet,
	isGlobuleAddress_Tube
} from '$lib/util';

/** Union type for address types that can be selected */
type SelectableAddress = GlobuleAddress_Tube | GlobuleAddress_Band | GlobuleAddress_Facet;

/** Function type for checking if an address is selected */
type AddressSelector = <T extends SelectableAddress>(a: T) => boolean;

/** Return type for selectedProjectionGeometry store */
export type SelectedProjectionGeometry = {
	isSelected: AddressSelector;
	isPartner: AddressSelector;
	isSelectedOrPartner: AddressSelector;
	isStartPartner: AddressSelector;
	isEndPartner: AddressSelector;
	geometry: {
		facet: BufferGeometry;
		partner: BufferGeometry;
		startPartner: BufferGeometry;
		endPartner: BufferGeometry;
	};
	selected: (GlobuleAddress_Facet | undefined)[];
	selectedPartners: (GlobuleAddress_Facet | undefined)[];
	selectedStartPartners: (GlobuleAddress_Facet | undefined)[];
	selectedEndPartners: (GlobuleAddress_Facet | undefined)[];
} | null;

export const selectedGlobule = writable<{
	address?: GeometryAddress<BandAddressed | GlobuleAddressed>;
	subGlobuleConfigIndex: number;
	subGlobuleConfigId?: Id;
	// subGlobuleRecurrence?: number;
	subGlobuleGeometryIndex?: number;
	globuleId?: Id;
}>({
	address: undefined,
	subGlobuleConfigIndex: 0,
	subGlobuleConfigId: undefined,
	// subGlobuleRecurrence: undefined,
	subGlobuleGeometryIndex: undefined,
	globuleId: undefined
});

export type SelectionType = 'highlighted' | 'active' | 'hovered';

export type ActiveGeometryAddress = GeometryAddress<BandAddressed> & { t?: number };

export type BandSelection = {
	selection: SelectionType[];
	coord: BandConfigCoordinates;
	coordStack?: GlobuleConfigCoordinates[];
	address: GeometryAddress<BandAddressed>;
	subGlobuleConfigIndex: number;
	subGlobuleConfigId?: Id;
	subGlobuleRecurrence?: number;
	globuleId?: Id;
	transformIndex?: number;
	subGlobuleGeometryIndex?: number;
	bandIndex?: number;
};

export const selectedBand = writable<ActiveGeometryAddress>({ s: 0, g: [], b: 0 });

export const generateGenericSelection = (sgIndex: number, tCount?: number, bIndex?: number) => {
	return { s: sgIndex, g: new Array(tCount).fill(0), b: bIndex ?? 0 };
};

export const selectedSubGlobuleIndex = derived(
	[superConfigStore, selectedGlobule],
	([$superConfigStore, $selectedGlobule]) => {
		const index = $selectedGlobule.globuleId
			? $superConfigStore.subGlobuleConfigs.findIndex(
					(subGlobuleConfig) => subGlobuleConfig.globuleConfig.id === $selectedGlobule.globuleId
			  )
			: 0;

		return index;
	}
);

export const selectedGlobuleConfig = derived(
	[superConfigStore, selectedSubGlobuleIndex],
	([$superConfigStore, $selectedSubGlobuleIndex]) => {
		return $superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig;
	}
);

export type SelectionMode = {
	sequential: 'replace' | 'add' | 'remove';
	includes: {
		facet?: boolean;
		band?: boolean;
		tube?: boolean;
		projection?: boolean;
		partners?: boolean;
	};
};

export const selectMode = writable<SelectionMode>({
	sequential: 'replace',
	includes: {
		// tube: true,
		band: true,
		// facet: true,
		partners: true
	}
});

export const selectedProjection = writable<GlobuleAddress_Facet>({
	globule: 0,
	tube: 0,
	band: 2,
	facet: 0
});

const getSelectedFacet = (address: GlobuleAddress_Facet, sg: SuperGlobule, mode: SelectionMode) => {
	const facets = new Set<Facet>([]);
	if (mode.includes.tube) {
		sg.projections[address.globule].tubes[address.tube].bands.forEach((band) =>
			band.facets.forEach((facet) => facets.add(facet))
		);
	} else if (mode.includes.band) {
		sg.projections[address.globule].tubes[address.tube].bands[address.band].facets.forEach(
			(facet) => facets.add(facet)
		);
	} else if (mode.includes.facet) {
		facets.add(
			sg.projections[address.globule].tubes[address.tube].bands[address.band].facets[address.facet]
		);
	}
	return Array.from(facets);
};

const getPartnerFacets = (facets: Facet[], sg: SuperGlobule, mode: SelectionMode) => {
	if (!mode.includes.partners)
		return {
			startPartnerFacets: [] as Facet[],
			endPartnerFacets: [] as Facet[],
			partnerFacets: [] as Facet[]
		};
	const facetAddresses = new Set(facets.map((facet) => concatAddress(facet.address)));
	const partners = new Set<Facet>([]);
	const endPartners = new Set<Facet>([]);
	const startPartners = new Set<Facet>([]);
	facets.forEach((facet, facetIndex) => {
		if (facet.meta) {
			const partnerAddresses = [
				facet.meta.ab.partner,
				facet.meta.ac.partner,
				facet.meta.bc.partner
			];
			partnerAddresses.forEach((a) => {
				let receiver;
				if (a.tube !== facet.address?.tube && facetIndex === 0) {
					receiver = startPartners;
				} else if (a.tube !== facet.address?.tube && facetIndex === facets.length - 1) {
					receiver = endPartners;
				} else {
					receiver = partners;
				}
				const { globule: g, tube: t, band: b, facet: f } = a;
				if (!facetAddresses.has(concatAddress(a))) {
					if (mode.includes.tube) {
						sg.projections[g].tubes[t].bands.forEach((band) => {
							band.facets.forEach((facet) => receiver.add(facet));
						});
					} else if (mode.includes.band) {
						sg.projections[g].tubes[t].bands[b].facets.forEach((facet) => receiver.add(facet));
					} else if (mode.includes.facet) {
						receiver.add(sg.projections[g].tubes[t].bands[b].facets[f]);
					}
				}
			});
		}
	});
	return {
		startPartnerFacets: Array.from(startPartners),
		endPartnerFacets: Array.from(endPartners),
		partnerFacets: Array.from(partners)
	};
};

export const selectedProjectionGeometry = derived(
	[selectedProjection, superGlobuleStore, superGlobulePatternStore, selectMode],
	([
		$selectedProjection,
		$superGlobuleStore,
		$superGlobulePatternStore,
		$selectMode
	]): SelectedProjectionGeometry => {
		if (!$selectedProjection) return null;

		const selectedFacets: Facet[] = getSelectedFacet(
			$selectedProjection,
			$superGlobuleStore,
			$selectMode
		);

		const { startPartnerFacets, endPartnerFacets, partnerFacets } = getPartnerFacets(
			selectedFacets,
			$superGlobuleStore,
			$selectMode
		);

		const facetPoints = selectedFacets
			.map(({ triangle }) => [triangle.a, triangle.b, triangle.c])
			.flat();
		const facetGeometry = new BufferGeometry().setFromPoints(facetPoints);
		facetGeometry.computeVertexNormals();

		const partnerPoints = partnerFacets
			.map(({ triangle }) => [triangle.a, triangle.b, triangle.c])
			.flat();
		const partnerGeometry = new BufferGeometry().setFromPoints(partnerPoints);
		partnerGeometry.computeVertexNormals();

		const selected = selectedFacets.map((f) => f.address);
		const selectedPartners = partnerFacets.map((f) => f.address);
		const selectedStartPartners = startPartnerFacets.map((f) => f.address);
		const selectedEndPartners = endPartnerFacets.map((f) => f.address);

		const startPartnerPoints = startPartnerFacets
			.map(({ triangle }) => [triangle.a, triangle.b, triangle.c])
			.flat();
		const startPartnerGeometry = new BufferGeometry().setFromPoints(startPartnerPoints);
		startPartnerGeometry.computeVertexNormals();

		const endPartnerPoints = endPartnerFacets
			.map(({ triangle }) => [triangle.a, triangle.b, triangle.c])
			.flat();
		const endPartnerGeometry = new BufferGeometry().setFromPoints(endPartnerPoints);
		endPartnerGeometry.computeVertexNormals();

		return {
			isSelected: ((a) => isSelected(a, selected)) as AddressSelector,
			isPartner: ((a) => isSelected(a, selectedPartners)) as AddressSelector,
			isSelectedOrPartner: ((a) =>
				isSelected(a, [...selectedStartPartners, ...selectedEndPartners, ...selected]) ||
				isSelected(a, selected)) as AddressSelector,
			isStartPartner: ((a) => isSelected(a, selectedStartPartners)) as AddressSelector,
			isEndPartner: ((a) => isSelected(a, selectedEndPartners)) as AddressSelector,
			geometry: {
				facet: facetGeometry,
				partner: partnerGeometry,
				startPartner: startPartnerGeometry,
				endPartner: endPartnerGeometry
			},
			selected,
			selectedPartners,
			selectedStartPartners,
			selectedEndPartners
		};
	}
);

const isSelected = <T extends SelectableAddress>(
	a: T,
	selected: (GlobuleAddress_Facet | undefined)[]
): boolean => {
	if (isGlobuleAddress_Facet(a)) {
		const a0 = concatAddress_Facet(a);
		return selected.some((aX) => aX && concatAddress_Facet(aX) === a0);
	}
	if (isGlobuleAddress_Band(a)) {
		const a0 = concatAddress_Band(a);
		return selected.some((aX) => aX && concatAddress_Band(aX) === a0);
	}
	if (isGlobuleAddress_Tube(a)) {
		const a0 = concatAddress_Tube(a);
		return selected.some((aX) => aX && concatAddress_Tube(aX) === a0);
	}

	return false;
};
