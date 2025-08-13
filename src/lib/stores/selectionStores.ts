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
	ProjectionAddress,
	ProjectionAddress_Band,
	ProjectionAddress_Facet,
	ProjectionAddress_FacetEdge,
	ProjectionAddress_Projection,
	ProjectionAddress_Tube
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

export const selectedProjection = writable<ProjectionAddress_Facet>({
	projection: 0,
	tube: 0,
	band: 2,
	facet: 0
});

export const selectedProjectionGeometry = derived(
	[selectedProjection, superGlobuleStore, superGlobulePatternStore, selectMode],
	([$selectedProjection, $superGlobuleStore, $superGlobulePatternStore, $selectMode]) => {
		if (!$selectedProjection) return null;
		const { projection: p, tube: t, band: b, facet: f } = $selectedProjection;

		const selectedFacets: Facet[] = [];
		selectedFacets.push($superGlobuleStore.projections[p].tubes[t].bands[b].facets[f]);

		const facetPoints = selectedFacets
			.map(({ triangle }) => [triangle.a, triangle.b, triangle.c])
			.flat();
		const facetGeometry = new BufferGeometry().setFromPoints(facetPoints);
		facetGeometry.computeVertexNormals();

		let partnerGeometry;
		let selectedPartners: ProjectionAddress_Facet[] = [];
		if ($selectMode.includes.partners) {
			const partners = new Set<ProjectionAddress_FacetEdge>();

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
					console.debug({ edgesMeta });
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
			isSelected: <
				T extends ProjectionAddress_Tube | ProjectionAddress_Band | ProjectionAddress_Facet
			>(
				a: T
			) => isSelected(a, selected),
			isPartner: <
				T extends ProjectionAddress_Tube | ProjectionAddress_Band | ProjectionAddress_Facet
			>(
				a: T
			) => isSelected(a, selectedPartners),
			isSelectedOrPartner: <
				T extends ProjectionAddress_Tube | ProjectionAddress_Band | ProjectionAddress_Facet
			>(
				a: T
			) => isSelected(a, selectedPartners) || isSelected(a, selected),
			geometry: { facet: facetGeometry, partner: partnerGeometry },
			selected,
			selectedPartners
		};
	}
);

const isSelected = <
	T extends ProjectionAddress_Tube | ProjectionAddress_Band | ProjectionAddress_Facet
>(
	a: T,
	selected: (ProjectionAddress_Facet | undefined)[]
) => {
	if (isProjectionAddress_Facet(a)) {
		const a0 = concatAddress_Facet(a);
		return selected.some((aX) => aX && concatAddress_Facet(aX) === a0);
	}
	if (isProjectionAddress_Band(a)) {
		const a0 = concatAddress_Band(a);
		return selected.some((aX) => aX && concatAddress_Band(aX) === a0);
	}
	if (isProjectionAddress_Tube(a)) {
		const a0 = concatAddress_Tube(a);
		return selected.some((aX) => aX && concatAddress_Tube(aX) === a0);
	}

	return false;
};

const getFacetByAddress = (
	sg: SuperGlobule,
	a: ProjectionAddress_Facet | ProjectionAddress_FacetEdge
) => {
	return sg.projections[a.projection].tubes[a.tube].bands[a.band].facets[a.facet];
};

export const addressIsInArray = (
	a0: ProjectionAddress_Facet | ProjectionAddress_FacetEdge,
	arr: (ProjectionAddress_Facet | ProjectionAddress_FacetEdge | undefined)[]
) => {
	const a0str = concatAddress_Facet(a0);
	return arr.some((a) => a && concatAddress_Facet(a) === a0str);
};

const isProjectionAddress_Facet = (a: ProjectionAddress): a is ProjectionAddress_Facet =>
	isProjectionAddress_Band(a) && Object.hasOwn(a, 'facet');
const isProjectionAddress_Band = (a: ProjectionAddress): a is ProjectionAddress_Band =>
	isProjectionAddress_Tube(a) && Object.hasOwn(a, 'band');
const isProjectionAddress_Tube = (a: ProjectionAddress): a is ProjectionAddress_Tube =>
	isProjectionAddress_Projection(a) && Object.hasOwn(a, 'tube');
const isProjectionAddress_Projection = (a: ProjectionAddress): a is ProjectionAddress_Projection =>
	Object.hasOwn(a, 'projection');

export const concatAddress_Facet = (a: ProjectionAddress_Facet) => {
	return `p${a.projection}t${a.tube}b${a.band}f${a.facet}`;
};
export const concatAddress_Band = (a: ProjectionAddress_Band) => {
	return `p${a.projection}t${a.tube}b${a.band}`;
};
export const concatAddress_Tube = (a: ProjectionAddress_Tube) => {
	return `p${a.projection}t${a.tube}`;
};
