<script lang="ts">
	import { T } from '@threlte/core';
	import { materials } from '../three-renderer/materials';
	import { BufferGeometry, Object3D, Vector3 } from 'three';
	import { collateGeometry } from '$lib/projection-geometry/collate-geometry';
	import {
		superConfigStore,
		viewControlStore,
		type ShowProjectionGeometries,
		superGlobuleStore,
		addressIsInArray,
		superGlobulePatternStore
	} from '$lib/stores';
	import type {
		BaseProjectionConfig,
		Polyhedron,
		Projection,
		ProjectionAddress_Facet,
		Tube
	} from '$lib/projection-geometry/types';
	import ColorMapped from './ColorMapped.svelte';
	import { selectedProjectionGeometry } from '$lib/stores';

	let geometry: {
		surface?: Object3D;
		polygons?: BufferGeometry[];
		projection?: BufferGeometry;
		sections?: BufferGeometry;
		bands?: BufferGeometry[];
		facets?: { address: ProjectionAddress_Facet; geometry: BufferGeometry }[];
	} = {};
	export let onClick: (event: any, address: ProjectionAddress_Facet) => void;
	let showNormals = false;

	type ProjectionData = {
		projection: Projection;
		polyhedron: Polyhedron;
		tubes: Tube[];
		surface: Object3D;
	};

	const update = (show: ShowProjectionGeometries, projectionData: ProjectionData[]) => {
		geometry = collateGeometry(projectionData[0], show);
	};

	const {
		projectionConfigs: [projectionConfig]
	} = $superConfigStore;

	const getFacet = (event: any) => {
		console.debug('getFacet', { event });
	};

	const getNormalIndicator = (
		{ address }: { address: ProjectionAddress_Facet },
		store: typeof $superGlobuleStore
	) => {
		const LENGTH = 25;
		const { triangle } =
			store.projections[address.projection].tubes[address.tube].bands[address.band].facets[
				address.facet
			];
		const normal = new Vector3();
		const anchor = new Vector3();
		const ab = triangle.b.clone().addScaledVector(triangle.a, -1).normalize();
		triangle.getNormal(normal);
		triangle.getMidpoint(anchor);

		const p2 = anchor.clone().addScaledVector(normal, LENGTH);

		const points = [anchor, p2, p2.clone().applyAxisAngle(ab, Math.PI / 100)];
		const geometry = new BufferGeometry().setFromPoints(points);
		geometry.computeVertexNormals();
		return geometry;
	};

	const COLOR_BY_BAND = true;

	const getMaterial = (
		address: ProjectionAddress_Facet,
		selectedGeometry: typeof $selectedProjectionGeometry
	) => {
		if (!selectedGeometry?.selected) return materials.default;

		if (selectedGeometry.isSelected(address)) {
			return materials.selected;
		} else if (selectedGeometry.isPartner(address)) {
			return materials.highlightedPrimary;
		} else if (COLOR_BY_BAND) {
			return materials.numbered[address.band];
		}
		return materials.default;
	};

	$: update($viewControlStore.showProjectionGeometry, $superGlobuleStore.projections);
</script>

{#if projectionConfig}
	<T.Group position={[0, 0, 0]}>
		{#if geometry.surface}
			<T is={geometry.surface} material={materials.selectedVeryLight} />
		{/if}

		<ColorMapped
			onClick={undefined}
			geometry={geometry.polygons?.slice(0,32)}
			groupSizeMap={[1, 5, 10, 10, 10, 10, 5, 5]}
			materials={materials.numbered}
		/>

		{#if geometry.projection}
			<T.Mesh geometry={geometry.projection} material={materials.highlightedSecondary} />
		{/if}
		{#if geometry.sections}
			<T.Mesh geometry={geometry.sections} material={materials.numbered[4]} />
		{/if}

		{#each geometry.bands || [] as band}
			<T.Mesh geometry={band} material={materials.default} />
		{/each}
		{#each geometry.facets || [] as facet}
			<T.Mesh
				geometry={facet.geometry}
				material={getMaterial(facet.address, $selectedProjectionGeometry)}
				on:click={(ev) => onClick(ev, facet.address)}
			/>
		{/each}
		{#if showNormals && geometry.facets}
			{#each geometry.facets as facet}
				<T.Mesh
					geometry={getNormalIndicator(facet, $superGlobuleStore)}
					material={materials.default}
				/>
			{/each}
		{/if}
		<!-- <ColorMapped
			geometry={geometry.bands}
			groupSizeMap={[10]}
			materials={materials.numbered}
			onClick={(ev) => onClick(ev, getFacet())}
		/> -->
		<!-- <Highlight /> -->
	</T.Group>
{/if}
