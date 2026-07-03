<script lang="ts">
	import { T } from '@threlte/core';
	import { getMaterial, materials } from '../three-renderer/materials';
	import { BufferGeometry, Object3D, Vector3 } from 'three';
	import {
		collateGeometry,
		collateGlobuleTubeGeometry,
		collateVoronoiGeometry
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
	import {
		assemblerHighlight,
		selectedProjection,
		selectedProjectionGeometry,
		selectedSurfaceProjection,
		selectedSurfaceProjectionGeometry,
		selectedVoronoiSurface,
		selectedVoronoiSurfaceGeometry
	} from '$lib/stores';
	import { handleFacetSelect } from '../three-renderer/selection-helpers';

	// Non-interactive visual meshes (bands, sections, the surface) must NOT
	// participate in pointer raycasting — otherwise an opaque grey band/surface in
	// front of a facet becomes the nearest hit, has no click handler, and swallows
	// the click so the facet behind it can never be selected. A no-op raycast keeps
	// these meshes visible while making only the facet meshes clickable.
	const noRaycast = () => {};

	// Stable key for {#each} blocks over facets, derived from the facet's address.
	const facetKey = (a: GlobuleAddress_Facet) => `${a.globule}-${a.tube}-${a.band}-${a.facet}`;

	// Wrap getMaterial so every facet also respects the Assembler cross-view
	// highlight (a band/ring clicked in the data grid). Reading $assemblerHighlight
	// here registers it as a dependency of each facet's material expression.
	const highlightedFacetMaterial = (
		address: GlobuleAddress_Facet,
		selectedGeometry: Parameters<typeof getMaterial>[1],
		config?: Parameters<typeof getMaterial>[2]
	) => getMaterial(address, selectedGeometry, config, $assemblerHighlight);

	let {
		onClick,
		showNormals = false,
		colorByBand = true
	}: {
		onClick: (event: any, address: GlobuleAddress_Facet) => void;
		showNormals?: boolean;
		colorByBand?: boolean;
	} = $props();

	let projectionGeometry: {
		surface?: Object3D;
		polygons?: BufferGeometry[];
		projection?: BufferGeometry;
		surfaceProjection?: BufferGeometry | BufferGeometry[];
		surfaceProjectionFacets?: { address: GlobuleAddress_Facet; geometry: BufferGeometry }[];
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
		surfaceProjectionTubes: Tube[];
		surface: Object3D;
	};

	const updateProjectionGeometry = (
		show: ShowProjectionGeometries,
		projectionData: ProjectionData[]
	) => {
		// projectionData is empty when the projection pipeline is gated off; nothing
		// to collate (collateGeometry destructures its first arg, so guard it).
		projectionGeometry = projectionData[0] ? collateGeometry(projectionData[0], show) : {};
	};

	const updateGlobuleTubeGeometry = (show: ShowGlobuleTubeGeometries, globuleTubes: Tube[]) => {
		globuleTubeGeometry = collateGlobuleTubeGeometry(globuleTubes, show);
	};

	const LENGTH = 25;
	const buildNormalGeometry = (
		triangle: {
			a: Vector3;
			b: Vector3;
			c: Vector3;
			getNormal: (target: Vector3) => Vector3;
			getMidpoint: (target: Vector3) => Vector3;
		},
		length: number
	) => {
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
		return buildNormalGeometry(triangle, length);
	};

	const getSurfaceProjectionNormals = (
		store: typeof $superGlobuleStore,
		length: number
	): BufferGeometry[] => {
		const geometries: BufferGeometry[] = [];
		store.projections.forEach((projection) => {
			projection.surfaceProjectionTubes?.forEach((tube) => {
				tube.bands.forEach((band) => {
					band.facets.forEach((facet) => {
						geometries.push(buildNormalGeometry(facet.triangle, length));
					});
				});
			});
		});
		return geometries;
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

	let voronoiGeometry: ReturnType<typeof collateVoronoiGeometry> = $state({});
	$effect(() => {
		const voronoiTubes = $superGlobuleStore.voronoiResult?.tubes ?? [];
		const voronoiSurfaceProjectionTubes =
			$superGlobuleStore.voronoiResult?.surfaceProjectionTubes ?? [];
		voronoiGeometry = collateVoronoiGeometry(
			voronoiTubes,
			voronoiSurfaceProjectionTubes,
			$viewControlStore.showVoronoiGeometry
		);
	});
</script>

{#if $viewControlStore.showProjectionGeometry.any}
	<!-- // use negative y scale to match SVG coordinates -->
	<T.Group position={[0, 0, 0]} scale={[1, 1, 1]}>
		{#if projectionGeometry.surface}
			<T is={projectionGeometry.surface} material={materials.selected} raycast={noRaycast} />
		{/if}

		<ColorMapped
			onClick={undefined}
			geometry={projectionGeometry.polygons}
			groupSizeMap={[1, 130, 5, 5, 5, 5, 5, 5, 5, 5]}
			materials={materials.numbered}
		/>

		{#if projectionGeometry.projection}
			<T.Mesh
				geometry={projectionGeometry.projection}
				material={materials.highlightedSecondary}
				raycast={noRaycast}
			/>
		{/if}
		{#if projectionGeometry.surfaceProjectionFacets}
			{#each projectionGeometry.surfaceProjectionFacets as facet (facetKey(facet.address))}
				<T.Mesh
					geometry={facet.geometry}
					material={highlightedFacetMaterial(facet.address, $selectedSurfaceProjectionGeometry, {
						colorByBand
					})}
					onclick={(ev) =>
						handleFacetSelect(
							ev,
							'surfaceProjection',
							facet.address,
							(a) => ($selectedSurfaceProjection = a)
						)}
				/>
			{/each}
		{:else if projectionGeometry.surfaceProjection}
			{#if Array.isArray(projectionGeometry.surfaceProjection)}
				{#each projectionGeometry.surfaceProjection as band, i (band.id)}
					<T.Mesh
						geometry={band}
						material={materials.numbered[i % materials.numbered.length]}
						raycast={noRaycast}
					/>
				{/each}
			{:else}
				<T.Mesh
					geometry={projectionGeometry.surfaceProjection}
					material={materials.highlightedSecondary}
					raycast={noRaycast}
				/>
			{/if}
		{/if}
		{#if showNormals && projectionGeometry.surfaceProjectionFacets}
			{#each getSurfaceProjectionNormals($superGlobuleStore, 80) as normalGeometry (normalGeometry.id)}
				<T.Mesh geometry={normalGeometry} material={materials.highlightedPrimary} />
			{/each}
		{/if}
		{#if projectionGeometry.sections}
			<T.Mesh
				geometry={projectionGeometry.sections}
				material={materials.numbered[4]}
				raycast={noRaycast}
			/>
		{/if}

		{#each projectionGeometry.bands || [] as band (band.id)}
			<T.Mesh geometry={band} material={materials.selected} raycast={noRaycast} />
		{/each}
		{#each projectionGeometry.facets || [] as facet (facetKey(facet.address))}
			<T.Mesh
				geometry={facet.geometry}
				material={highlightedFacetMaterial(facet.address, $selectedProjectionGeometry, {
					colorByBand
				})}
				onclick={(ev) =>
					handleFacetSelect(ev, 'projection', facet.address, (a) => selectedProjection.set(a))}
			/>
		{/each}
		{#if showNormals && projectionGeometry.facets}
			{#each projectionGeometry.facets as facet (facetKey(facet.address))}
				<T.Mesh
					geometry={getNormalIndicator(facet, $superGlobuleStore, { length: 80 })}
					material={materials.highlightedPrimary}
				/>
			{/each}
		{/if}
	</T.Group>
{/if}

{#if $viewControlStore.showVoronoiGeometry.any}
	<T.Group position={[0, 0, 0]}>
		{#if voronoiGeometry.sections}
			<T.Mesh
				geometry={voronoiGeometry.sections}
				material={materials.numbered[4]}
				raycast={noRaycast}
			/>
		{/if}
		{#each voronoiGeometry.bands || [] as band (band.id)}
			<T.Mesh geometry={band} material={materials.default} raycast={noRaycast} />
		{/each}
		{#each voronoiGeometry.rimBands || [] as band (band.id)}
			<!-- Open-surface rim tubes, coloured red to distinguish them -->
			<T.Mesh geometry={band} material={materials.numbered[1]} raycast={noRaycast} />
		{/each}
		{#each voronoiGeometry.facets || [] as facet (facetKey(facet.address))}
			<T.Mesh
				geometry={facet.geometry}
				material={highlightedFacetMaterial(facet.address, $selectedProjectionGeometry)}
				onclick={(ev) =>
					handleFacetSelect(ev, 'voronoi', facet.address, (a) => selectedProjection.set(a))}
			/>
		{/each}
		{#each voronoiGeometry.surfaceProjectionFacets || [] as facet (facetKey(facet.address))}
			<T.Mesh
				geometry={facet.geometry}
				material={highlightedFacetMaterial(facet.address, $selectedVoronoiSurfaceGeometry, {
					zebraStriped: true
				})}
				onclick={(ev) =>
					handleFacetSelect(
						ev,
						'voronoiSurface',
						facet.address,
						(a) => ($selectedVoronoiSurface = a)
					)}
			/>
		{/each}
	</T.Group>
{/if}

{#if $viewControlStore.showGlobuleTubeGeometry.any}
	<T.Group position={[0, 0, 0]}>
		{#if globuleTubeGeometry.sections}
			<T.Mesh
				geometry={globuleTubeGeometry.sections}
				material={materials.numbered[4]}
				raycast={noRaycast}
			/>
		{/if}
		{#each globuleTubeGeometry.bands || [] as band (band.id)}
			<T.Mesh geometry={band} material={materials.default} raycast={noRaycast} />
		{/each}
		{#each globuleTubeGeometry.facets || [] as facet (facetKey(facet.address))}
			<T.Mesh
				geometry={facet.geometry}
				material={highlightedFacetMaterial(facet.address, $selectedProjectionGeometry)}
				onclick={(ev) =>
					handleFacetSelect(ev, 'globuleTube', facet.address, (a) => selectedProjection.set(a))}
			/>
		{/each}
		{#if showNormals && globuleTubeGeometry.facets}
			{#each globuleTubeGeometry.facets as facet (facetKey(facet.address))}
				<T.Mesh
					geometry={getNormalIndicator(facet, $superGlobuleStore, { length: 200 })}
					material={materials.highlightedPrimary}
				/>
			{/each}
		{/if}
	</T.Group>
{/if}
