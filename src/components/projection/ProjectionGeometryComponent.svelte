<script lang="ts">
	import { T } from '@threlte/core';
	import { getMaterial, materials } from '../three-renderer/materials';
	import { BufferGeometry, Object3D, Vector3 } from 'three';
	import {
		collateGeometry,
		collateGlobuleTubeGeometry
	} from '$lib/projection-geometry/collate-geometry';
	import {
		viewControlStore,
		type ShowProjectionGeometries,
		type ShowGlobuleTubeGeometries,
		superGlobuleStore
	} from '$lib/stores';
	import type {
		Polyhedron,
		Projection,
		GlobuleAddress_Facet,
		Tube
	} from '$lib/projection-geometry/types';
	import ColorMapped from './ColorMapped.svelte';
	import { selectedProjectionGeometry } from '$lib/stores';

	let {
		onClick,
		showNormals = false,
		colorByBand = false,
		colorEndFacets = true
	}: {
		onClick: (event: any, address: GlobuleAddress_Facet) => void;
		showNormals?: boolean;
		colorByBand?: boolean;
		colorEndFacets?: boolean;
	} = $props();

	let projectionGeometry: {
		surface?: Object3D;
		polygons?: BufferGeometry[];
		projection?: BufferGeometry;
		sections?: BufferGeometry;
		bands?: BufferGeometry[];
		facets?: { address: GlobuleAddress_Facet; geometry: BufferGeometry }[];
	} = $state({});
	let globuleTubeGeometry: {
		sections?: BufferGeometry;
		bands?: BufferGeometry[];
		facets?: { address: GlobuleAddress_Facet; geometry: BufferGeometry }[];
	} = $state({});

	type ProjectionData = {
		projection: Projection;
		polyhedron: Polyhedron;
		tubes: Tube[];
		surface: Object3D;
	};

	const updateProjectionGeometry = (
		show: ShowProjectionGeometries,
		projectionData: ProjectionData[]
	) => {
		projectionGeometry = collateGeometry(projectionData[0], show);
	};

	const updateGlobuleTubeGeometry = (show: ShowGlobuleTubeGeometries, globuleTubes: Tube[]) => {
		globuleTubeGeometry = collateGlobuleTubeGeometry(globuleTubes, show);
	};

	const LENGTH = 25;
	const getNormalIndicator = (
		{ address }: { address: GlobuleAddress_Facet },
		store: typeof $superGlobuleStore,
		config: { length: number }
	) => {
		const length = config?.length ?? LENGTH;
		const { triangle } =
			store.projections[address.globule].tubes[address.tube].bands[address.band].facets[
				address.facet
			];
		const normal = new Vector3();
		const anchor = new Vector3();
		const ab = triangle.b.clone().addScaledVector(triangle.a, -1).normalize();
		triangle.getNormal(normal);
		triangle.getMidpoint(anchor);

		const p2 = anchor.clone().addScaledVector(normal, length);

		const points = [anchor, p2, p2.clone().applyAxisAngle(ab, Math.PI / 100)];
		const geometry = new BufferGeometry().setFromPoints(points);
		geometry.computeVertexNormals();
		return geometry;
	};

	$effect(() => {
		updateProjectionGeometry(
			$viewControlStore.showProjectionGeometry,
			$superGlobuleStore.projections
		);
	});
	$effect(() => {
		updateGlobuleTubeGeometry(
			$viewControlStore.showGlobuleTubeGeometry,
			$superGlobuleStore.globuleTubes
		);
	});
</script>

{#if $viewControlStore.showProjectionGeometry.any}
	<!-- // use negative y scale to match SVG coordinates -->
	<T.Group position={[0, 0, 0]} scale={[1, 1, 1]}>
		{#if projectionGeometry.surface}
			<T is={projectionGeometry.surface} material={materials.selected} />
		{/if}

		<ColorMapped
			onClick={undefined}
			geometry={projectionGeometry.polygons}
			groupSizeMap={[1, 130, 5, 5, 5, 5, 5, 5, 5, 5]}
			materials={materials.numbered}
		/>

		{#if projectionGeometry.projection}
			<T.Mesh geometry={projectionGeometry.projection} material={materials.highlightedSecondary} />
		{/if}
		{#if projectionGeometry.sections}
			<T.Mesh geometry={projectionGeometry.sections} material={materials.numbered[4]} />
		{/if}

		{#each projectionGeometry.bands || [] as band}
			<T.Mesh geometry={band} material={materials.selected} />
		{/each}
		{#each projectionGeometry.facets || [] as facet}
			<T.Mesh
				geometry={facet.geometry}
				material={getMaterial(facet.address, $selectedProjectionGeometry, {
					colorByBand,
					colorEndFacets
				})}
				onclick={(ev) => onClick(ev, facet.address)}
			/>
		{/each}
		{#if showNormals && projectionGeometry.facets}
			{#each projectionGeometry.facets as facet}
				<T.Mesh
					geometry={getNormalIndicator(facet, $superGlobuleStore, { length: 80 })}
					material={materials.highlightedPrimary}
				/>
			{/each}
		{/if}
	</T.Group>
{/if}

{#if $viewControlStore.showGlobuleTubeGeometry.any}
	<T.Group position={[0, 0, 0]}>
		{#if globuleTubeGeometry.sections}
			<T.Mesh geometry={globuleTubeGeometry.sections} material={materials.numbered[4]} />
		{/if}
		{#each globuleTubeGeometry.bands || [] as band}
			<T.Mesh geometry={band} material={materials.default} />
		{/each}
		{#each globuleTubeGeometry.facets || [] as facet}
			<T.Mesh
				geometry={facet.geometry}
				material={getMaterial(facet.address, $selectedProjectionGeometry)}
				onclick={(ev) => onClick(ev, facet.address)}
			/>
		{/each}
		{#if showNormals && globuleTubeGeometry.facets}
			{#each globuleTubeGeometry.facets as facet}
				<T.Mesh
					geometry={getNormalIndicator(facet, $superGlobuleStore, { length: 200 })}
					material={materials.highlightedPrimary}
				/>
			{/each}
		{/if}
	</T.Group>
{/if}
