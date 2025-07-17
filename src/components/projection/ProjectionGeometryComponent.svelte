<script lang="ts">
	import { T } from '@threlte/core';
	import { makeProjection } from '$lib/projection-geometry/generate-projection';
	import { materials } from '../three-renderer-v2/materials';
	import { BufferGeometry, Mesh, Object3D, SphereGeometry, Vector3 } from 'three';
	import { collateGeometry } from '$lib/projection-geometry/collate-geometry';
	import {
		superConfigStore,
		viewControlStore,
		type ShowProjectionGeometries,
		superGlobuleStore
	} from '$lib/stores';
	import type {
		BaseProjectionConfig,
		Polyhedron,
		Projection,
		Tube
	} from '$lib/projection-geometry/types';
	import ColorMapped from './ColorMapped.svelte';
	let geometry: {
		surface?: Object3D;
		polygons?: BufferGeometry[];
		projection?: BufferGeometry;
		sections?: BufferGeometry;
		bands?: BufferGeometry[];
	} = {};
	export let handleClick;

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

	$: update($viewControlStore.showProjectionGeometry, $superGlobuleStore.projections);
</script>

{#if projectionConfig}
	<T.Group position={[0, 0, 0]} on:click={(ev) => handleClick(ev)}>
		{#if geometry.surface}
			<T is={geometry.surface} material={materials.selectedVeryLight} />
		{/if}

		<ColorMapped
			geometry={geometry.polygons}
			groupSizeMap={[1, 5, 10, 10, 10, 10, 5, 5]}
			materials={materials.numbered}
		/>

		{#if geometry.projection}
			<T.Mesh geometry={geometry.projection} material={materials.highlightedSecondary} />
		{/if}
		{#if geometry.sections}
			<T.Mesh geometry={geometry.sections} material={materials.highlightedPrimary} />
		{/if}
		<ColorMapped geometry={geometry.bands} materials={materials.selectedLight} />
	</T.Group>
{/if}
