<script lang="ts">
	import { T } from '@threlte/core';
	import { getBandMaterial, getMaterial, materials } from '../three-renderer/materials';
	import { BufferGeometry, Mesh, Object3D, Vector3 } from 'three';
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
		GlobuleAddress_Band,
		GlobuleAddress_Facet,
		Tube
	} from '$lib/projection-geometry/types';
	import ColorMapped from './ColorMapped.svelte';
	import {
		assemblerHighlight,
		selectedGlobuleTube,
		selectedGlobuleTubeGeometry,
		selectedProjection,
		selectedProjectionGeometry,
		selectedSurfaceProjection,
		selectedSurfaceProjectionGeometry,
		selectedVoronoi,
		selectedVoronoiGeometry,
		selectedVoronoiSurface,
		selectedVoronoiSurfaceGeometry,
		patternBandSpaces,
		type AssemblerHighlight,
		type GeometrySource
	} from '$lib/stores';
	import { handleFacetSelect, highlightRealBand } from '../three-renderer/selection-helpers';
	import { assemblerHighlightToReal } from '$lib/cut-pattern/pattern-band-space';
	import { get } from 'svelte/store';
	import { interactionMode, isMeasureInteractionMode } from '../three-renderer/interaction-mode';
	import { nearestVertexFromEvent } from '../three-renderer/nearest-vertex';
	import { addMeasurementPoint } from '$lib/stores/measurementStore';
	import { bandKey } from '$lib/cut-pattern/band-key';

	// Non-interactive visual meshes (bands, sections, the surface) must NOT
	// participate in pointer raycasting — otherwise an opaque grey band/surface in
	// front of a facet becomes the nearest hit, has no click handler, and swallows
	// the click so the facet behind it can never be selected. A no-op raycast keeps
	// these meshes visible while making only the facet meshes clickable.
	const noRaycast = () => {};

	// Bands, sections and rim tubes opt out of raycasting (above) so an opaque band
	// in front cannot swallow a click meant for a facet behind it. Measurement wants
	// the opposite: the nearest visible SURFACE, whatever kind of mesh it belongs to
	// — the user's spec is "clicks on the 3d model", not "clicks on facets", and
	// facets are usually hidden while bands are shown. So while measuring, these
	// meshes become raycastable again and a group-level handler places the point.
	let isMeasuring = $derived(isMeasureInteractionMode($interactionMode));
	let surfaceRaycast = $derived(isMeasuring ? Mesh.prototype.raycast : noRaycast);

	// Band meshes are the only clickable thing in a bands-only view, so they must
	// raycast when their source's facets are hidden. With facets shown, they go back
	// to opting out — otherwise an opaque band in front swallows the facet click.
	// (Measuring always wants the nearest visible surface, whichever mesh it is.)
	const bandRaycast = (showFacets: boolean, address?: GlobuleAddress_Band) =>
		isMeasuring || (!showFacets && address) ? Mesh.prototype.raycast : noRaycast;

	type BandClickEvent = { stopPropagation?: () => void };

	// A band-mesh click drives the Assembler cross-view highlight only — band meshes
	// carry no facet index, so there is nothing to feed the per-source facet
	// selection stores. Suppressed while measuring, where the group-level handler
	// places a measurement point instead.
	const handleBandClick = (
		ev: BandClickEvent,
		source: GeometrySource,
		address?: GlobuleAddress_Band
	) => {
		if (!address) return;
		if (isMeasureInteractionMode(get(interactionMode))) return;
		ev.stopPropagation?.();
		highlightRealBand(source, address);
	};

	const handleSurfaceMeasureClick = (ev: {
		object?: unknown;
		point?: Vector3;
		intersections?: { object: unknown; point?: Vector3 }[];
		stopPropagation?: () => void;
	}) => {
		if (!isMeasureInteractionMode(get(interactionMode))) return;
		ev.stopPropagation?.();
		const vertex = nearestVertexFromEvent(ev);
		if (vertex) addMeasurementPoint(vertex);
	};

	// Stable key for {#each} blocks over facets, derived from the facet's address.
	const facetKey = (a: GlobuleAddress_Facet) => `${a.globule}-${a.tube}-${a.band}-${a.facet}`;
	// Bands without an address (see `collateAddressedBandGeometry`) still render, so
	// the key falls back to the geometry's own uuid.
	const bandKeyOf = (band: { address?: GlobuleAddress_Band; geometry: BufferGeometry }) =>
		band.address ? bandKey(band.address) : band.geometry.uuid;

	// The Assembler highlight is in pattern band space; each source's meshes carry
	// real band addresses. Mapped once per source per highlight (not per mesh).
	let highlightFor = $derived.by(() => {
		const highlight = $assemblerHighlight;
		const spaceOf = $patternBandSpaces;
		const cache = new Map<GeometrySource, AssemblerHighlight>();
		return (source: GeometrySource): AssemblerHighlight => {
			if (!highlight) return null;
			if (!cache.has(source))
				cache.set(
					source,
					assemblerHighlightToReal(spaceOf(source, highlight.band.globule), highlight)
				);
			return cache.get(source) ?? null;
		};
	});

	// Wrap getMaterial so every facet also respects the Assembler cross-view
	// highlight (a band/ring clicked in the data grid). Reading `highlightFor`
	// here registers it as a dependency of each facet's material expression.
	const highlightedFacetMaterial = (
		source: GeometrySource,
		address: GlobuleAddress_Facet,
		selectedGeometry: Parameters<typeof getMaterial>[1],
		config?: Parameters<typeof getMaterial>[2]
	) => getMaterial(address, selectedGeometry, config, highlightFor(source));

	let {
		onClick,
		showNormals = false,
		colorByBand = true
	}: {
		onClick: (event: any, address: GlobuleAddress_Facet) => void;
		showNormals?: boolean;
		colorByBand?: boolean;
	} = $props();

	type AddressedBand = { address?: GlobuleAddress_Band; geometry: BufferGeometry };

	let projectionGeometry: {
		surface?: Object3D;
		polygons?: BufferGeometry[];
		projection?: BufferGeometry;
		surfaceProjection?: BufferGeometry | AddressedBand[];
		surfaceProjectionFacets?: { address: GlobuleAddress_Facet; geometry: BufferGeometry }[];
		sections?: BufferGeometry;
		bands?: AddressedBand[];
		facets?: { address: GlobuleAddress_Facet; geometry: BufferGeometry }[];
	} = $state({});
	let globuleTubeGeometry: {
		sections?: BufferGeometry;
		bands?: AddressedBand[];
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
	<T.Group position={[0, 0, 0]} scale={[1, 1, 1]} onclick={handleSurfaceMeasureClick}>
		{#if projectionGeometry.surface}
			<T is={projectionGeometry.surface} material={materials.selected} raycast={surfaceRaycast} />
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
				raycast={surfaceRaycast}
			/>
		{/if}
		{#if projectionGeometry.surfaceProjectionFacets}
			{#each projectionGeometry.surfaceProjectionFacets as facet (facetKey(facet.address))}
				<T.Mesh
					geometry={facet.geometry}
					material={highlightedFacetMaterial(
						'surfaceProjection',
						facet.address,
						$selectedSurfaceProjectionGeometry,
						{
							colorByBand
						}
					)}
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
				{#each projectionGeometry.surfaceProjection as band, i (bandKeyOf(band))}
					<T.Mesh
						geometry={band.geometry}
						material={getBandMaterial(
							band.address,
							highlightFor('surfaceProjection'),
							materials.numbered[i % materials.numbered.length]
						)}
						raycast={bandRaycast($viewControlStore.showProjectionGeometry.facets, band.address)}
						onclick={(ev: BandClickEvent) => handleBandClick(ev, 'surfaceProjection', band.address)}
					/>
				{/each}
			{:else}
				<T.Mesh
					geometry={projectionGeometry.surfaceProjection}
					material={materials.highlightedSecondary}
					raycast={surfaceRaycast}
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
				raycast={surfaceRaycast}
			/>
		{/if}

		{#each projectionGeometry.bands || [] as band (bandKeyOf(band))}
			<T.Mesh
				geometry={band.geometry}
				material={getBandMaterial(band.address, highlightFor('projection'), materials.selected)}
				raycast={bandRaycast($viewControlStore.showProjectionGeometry.facets, band.address)}
				onclick={(ev: BandClickEvent) => handleBandClick(ev, 'projection', band.address)}
			/>
		{/each}
		{#each projectionGeometry.facets || [] as facet (facetKey(facet.address))}
			<T.Mesh
				geometry={facet.geometry}
				material={highlightedFacetMaterial(
					'projection',
					facet.address,
					$selectedProjectionGeometry,
					{
						colorByBand
					}
				)}
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
	<T.Group position={[0, 0, 0]} onclick={handleSurfaceMeasureClick}>
		{#if voronoiGeometry.sections}
			<T.Mesh
				geometry={voronoiGeometry.sections}
				material={materials.numbered[4]}
				raycast={surfaceRaycast}
			/>
		{/if}
		{#each voronoiGeometry.bands || [] as band (bandKeyOf(band))}
			<T.Mesh
				geometry={band.geometry}
				material={getBandMaterial(band.address, highlightFor('voronoi'), materials.default)}
				raycast={bandRaycast($viewControlStore.showVoronoiGeometry.facets, band.address)}
				onclick={(ev: BandClickEvent) => handleBandClick(ev, 'voronoi', band.address)}
			/>
		{/each}
		{#each voronoiGeometry.rimBands || [] as band (bandKeyOf(band))}
			<!-- Open-surface rim tubes, coloured red to distinguish them -->
			<T.Mesh
				geometry={band.geometry}
				material={getBandMaterial(band.address, highlightFor('voronoi'), materials.numbered[1])}
				raycast={bandRaycast($viewControlStore.showVoronoiGeometry.facets, band.address)}
				onclick={(ev: BandClickEvent) => handleBandClick(ev, 'voronoi', band.address)}
			/>
		{/each}
		{#each voronoiGeometry.facets || [] as facet (facetKey(facet.address))}
			<T.Mesh
				geometry={facet.geometry}
				material={highlightedFacetMaterial('voronoi', facet.address, $selectedVoronoiGeometry)}
				onclick={(ev) =>
					handleFacetSelect(ev, 'voronoi', facet.address, (a) => selectedVoronoi.set(a))}
			/>
		{/each}
		{#each voronoiGeometry.surfaceProjectionFacets || [] as facet (facetKey(facet.address))}
			<T.Mesh
				geometry={facet.geometry}
				material={highlightedFacetMaterial(
					'voronoiSurface',
					facet.address,
					$selectedVoronoiSurfaceGeometry,
					{
						zebraStriped: true
					}
				)}
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
	<T.Group position={[0, 0, 0]} onclick={handleSurfaceMeasureClick}>
		{#if globuleTubeGeometry.sections}
			<T.Mesh
				geometry={globuleTubeGeometry.sections}
				material={materials.numbered[4]}
				raycast={surfaceRaycast}
			/>
		{/if}
		{#each globuleTubeGeometry.bands || [] as band (bandKeyOf(band))}
			<!-- Addressed band meshes so a band clicked in the Assembler grid highlights
			     here too, without needing the facet view turned on. -->
			<T.Mesh
				geometry={band.geometry}
				material={getBandMaterial(band.address, highlightFor('globuleTube'))}
				raycast={bandRaycast($viewControlStore.showGlobuleTubeGeometry.facets, band.address)}
				onclick={(ev: BandClickEvent) => handleBandClick(ev, 'globuleTube', band.address)}
			/>
		{/each}
		{#each globuleTubeGeometry.facets || [] as facet (facetKey(facet.address))}
			<T.Mesh
				geometry={facet.geometry}
				material={highlightedFacetMaterial(
					'globuleTube',
					facet.address,
					$selectedGlobuleTubeGeometry
				)}
				onclick={(ev) =>
					handleFacetSelect(ev, 'globuleTube', facet.address, (a) => selectedGlobuleTube.set(a))}
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
