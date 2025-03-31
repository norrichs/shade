<script lang="ts">
	import { T } from '@threlte/core';
	import { makeProjection } from '$lib/projection-geometry/generate-projection';
	import { materials } from '../three-renderer-v2/materials';
	import { BufferGeometry, SphereGeometry } from 'three';
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
	let geometry: {
		surface?: BufferGeometry;
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
		surfaceGeometry: SphereGeometry;
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
			<T.Mesh geometry={geometry.surface} material={materials.selectedVeryLight} />
		{/if}

		{#each geometry.polygons || [] as p, i}
			<T.Mesh geometry={p} material={materials.numbered[i]} />
		{/each}

		{#if geometry.projection}
			<T.Mesh geometry={geometry.projection} material={materials.highlightedSecondary} />
		{/if}
		{#if geometry.sections}
			<T.Mesh geometry={geometry.sections} material={materials.highlightedPrimary} />
		{/if}
		{#each geometry.bands || [] as b, i}
			<T.Mesh geometry={b} material={materials.selectedLight} />
		{/each}
	</T.Group>
{/if}
