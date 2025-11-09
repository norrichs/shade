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
	isSuperGlobuleProjectionPanelPattern,
	superConfigStore,
	superGlobulePatternStore,
	superGlobuleStore
} from './superGlobuleStores';
import type {
	GlobuleAddress,
	GlobuleAddress_Band,
	GlobuleAddress_Facet,
	GlobuleAddress_FacetEdge,
	GlobuleAddress_Globule,
	GlobuleAddress_Tube
} from '$lib/projection-geometry/types';
import { BufferGeometry } from 'three';

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
	includes: { partners: true }
});

export const selectedProjection = writable<GlobuleAddress_Facet>({
	globule: 0,
	tube: 0,
	band: 2,
	facet: 0
});

export const selectedProjectionGeometry = derived(
	[selectedProjection, superGlobuleStore, superGlobulePatternStore, selectMode],
	([$selectedProjection, $superGlobuleStore, $superGlobulePatternStore, $selectMode]) => {
		if (!$selectedProjection) return null;
		const { globule: p, tube: t, band: b, facet: f } = $selectedProjection;

		const selectedFacets: Facet[] = [$superGlobuleStore.projections[p].tubes[t].bands[b].facets[f]];

		const facetPoints = selectedFacets
			.map(({ triangle }) => [triangle.a, triangle.b, triangle.c])
			.flat();
		const facetGeometry = new BufferGeometry().setFromPoints(facetPoints);
		facetGeometry.computeVertexNormals();

		let partnerGeometry;
		let selectedPartners: GlobuleAddress_Facet[] = [];
		if ($selectMode.includes.partners) {
			const partners = new Set<GlobuleAddress_FacetEdge>();

			selectedFacets.forEach((facet) => {
				const { address: a } = facet;
				if (!a) return;

				const panel = isSuperGlobuleProjectionPanelPattern(
					$superGlobulePatternStore.projectionPattern
				)
					? $superGlobulePatternStore.projectionPattern.projectionPanelPattern?.tubes[a.tube].bands[
							a.band
					  ].panels[a.facet]
					: undefined;

				if (panel) {
					const edgesMeta = panel.meta.edges;
					if (edgesMeta?.ab) {
						partners.add(edgesMeta.ab.partner);
					}
					if (edgesMeta?.bc) {
						partners.add(edgesMeta.bc.partner);
					}
					if (edgesMeta?.ac) {
						partners.add(edgesMeta.ac.partner);
					}
				}
			});

			const partnerPoints = Array.from(partners)
				.map((partner) => {
					const t = getFacetByAddress($superGlobuleStore, partner).triangle;
					return [t.a, t.b, t.c];
				})
				.flat();
			partnerGeometry = new BufferGeometry().setFromPoints(partnerPoints);
			partnerGeometry.computeVertexNormals();
			selectedPartners = Array.from(partners);
		}

		const selected = selectedFacets.map((f) => f.address);

		return {
			isSelected: <T extends GlobuleAddress_Tube | GlobuleAddress_Band | GlobuleAddress_Facet>(
				a: T
			) => isSelected(a, selected),
			isPartner: <T extends GlobuleAddress_Tube | GlobuleAddress_Band | GlobuleAddress_Facet>(
				a: T
			) => isSelected(a, selectedPartners),
			isSelectedOrPartner: <
				T extends GlobuleAddress_Tube | GlobuleAddress_Band | GlobuleAddress_Facet
			>(
				a: T
			) => isSelected(a, selectedPartners) || isSelected(a, selected),
			geometry: { facet: facetGeometry, partner: partnerGeometry },
			selected,
			selectedPartners
		};
	}
);

const isSelected = <T extends GlobuleAddress_Tube | GlobuleAddress_Band | GlobuleAddress_Facet>(
	a: T,
	selected: (GlobuleAddress_Facet | undefined)[]
) => {
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

const getFacetByAddress = (
	sg: SuperGlobule,
	a: GlobuleAddress_Facet | GlobuleAddress_FacetEdge
) => {
	return sg.projections[a.globule].tubes[a.tube].bands[a.band].facets[a.facet];
};

export const addressIsInArray = (
	a0: GlobuleAddress_Facet | GlobuleAddress_FacetEdge,
	arr: (GlobuleAddress_Facet | GlobuleAddress_FacetEdge | undefined)[]
) => {
	const a0str = concatAddress_Facet(a0);
	return arr.some((a) => a && concatAddress_Facet(a) === a0str);
};

type AddressFormat = 'gtbf' | 'gtb' | 'gt' | 'tbf' | 'tb' | 't' | 'b' | 'f';

const isGlobuleAddress_Facet = (a: GlobuleAddress): a is GlobuleAddress_Facet =>
	isGlobuleAddress_Band(a) && Object.hasOwn(a, 'facet');
const isGlobuleAddress_Band = (a: GlobuleAddress): a is GlobuleAddress_Band =>
	isGlobuleAddress_Tube(a) && Object.hasOwn(a, 'band');
const isGlobuleAddress_Tube = (a: GlobuleAddress): a is GlobuleAddress_Tube =>
	isGlobuleAddress_Globule(a) && Object.hasOwn(a, 'tube');
const isGlobuleAddress_Globule = (a: GlobuleAddress): a is GlobuleAddress_Globule =>
	Object.hasOwn(a, 'globule');

export const concatAddress_Facet = (a: GlobuleAddress_Facet, format: AddressFormat = 'gtbf') => {
	switch (format) {
		case 'tbf':
			return `t${a.tube}b${a.band}f${a.facet}`;
		case 'tb':
			return `t${a.tube}b${a.band}`;
		case 't':
			return `t${a.tube}`;
		case 'b':
			return `b${a.band}`;
		case 'f':
			return `f${a.facet}`;
		case 'gtbf':
		default:
			return `g${a.globule}t${a.tube}b${a.band}f${a.facet}`;
	}
};
export const concatAddress_Band = (a: GlobuleAddress_Band, format: AddressFormat = 'gtb') => {
	switch (format) {
		case 'tb':
			return `t${a.tube}b${a.band}`;
		case 't':
			return `t${a.tube}`;
		case 'b':
			return `b${a.band}`;
		case 'gtb':
		default:
			return `g${a.globule}t${a.tube}b${a.band}`;
	}
};
export const concatAddress_Tube = (a: GlobuleAddress_Tube, format: AddressFormat = 't') => {
	switch (format) {
		case 't':
			return `t${a.tube}`;
		case 'gt':
		default:
			return `g${a.globule}t${a.tube}`;
	}
};

export const concatAddress = (
	a: GlobuleAddress | undefined,
	format: AddressFormat = 'gtbf'
): string => {
	if (!a) return '';
	if (isGlobuleAddress_Facet(a)) {
		return concatAddress_Facet(a, format);
	}
	if (isGlobuleAddress_Band(a)) {
		return concatAddress_Band(a, format);
	}
	if (isGlobuleAddress_Tube(a)) {
		return concatAddress_Tube(a, format);
	}
	return '';
};
