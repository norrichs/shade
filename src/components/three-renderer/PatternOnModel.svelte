<script lang="ts">
	/**
	 * View → "Pattern on model": every pattern band rasterised (raw strokes, no
	 * Prepare union) onto the 3D band it was cut from. UVs are the band's own path
	 * space (`buildPatternBandMesh`), so the GPU clips anything that spills past
	 * the band. The stroke is the material (black); the holes are solid
	 * white. The shadow pass cuts the holes out, so the interior light still
	 * throws the lattice.
	 *
	 * Meshes are built imperatively into one Group held in `$state.raw` — Three.js
	 * objects in deep `$state` trip Svelte's effect-depth limit (GlobuleMesh notes).
	 *
	 * Selection: the plain band/facet meshes of this source are hidden while the
	 * overlay is on, so the overlay takes their clicks (the same handlers, via the
	 * triangle's real facet index) and shows their marks — band highlights as a
	 * tint of the white holes (material colour × texture, so lines stay black; no
	 * re-raster), selected/partner facets as a translucent layer just above.
	 */
	import { T } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import {
		Box3,
		BackSide,
		BufferAttribute,
		BufferGeometry,
		CanvasTexture,
		DoubleSide,
		Group,
		Mesh,
		Color,
		MeshBasicMaterial,
		MeshStandardMaterial,
		SRGBColorSpace,
		Vector3
	} from 'three';
	import {
		collatedTubesStore,
		patternBandSpaces,
		patternSourceStore,
		superGlobuleStore,
		tubesForGeometrySource
	} from '#lib/stores/index.js';
	import {
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
		viewControlStore,
		type GeometrySource
	} from '#lib/stores/index.js';
	import { patternOnModelStore } from '#lib/stores/patternOnModelStore.js';
	import { bandHighlightState } from '#lib/stores/bandHighlightStore.js';
	import { sameGlobuleBand } from '#lib/assembler-highlight.js';
	import {
		HIGHLIGHT_PRIMARY,
		HIGHLIGHT_SECONDARY,
		PATTERN_FILTERED
	} from '#lib/highlight-colors.js';
	import { handleFacetSelect, highlightRealBand } from './selection-helpers';
	import { interactionMode, isMeasureInteractionMode } from './interaction-mode';
	import { nearestVertexFromEvent } from './nearest-vertex';
	import { addMeasurementPoint } from '#lib/stores/measurementStore.js';
	import { materials } from './materials';
	import { get } from 'svelte/store';
	import type {
		GlobuleAddress_Band,
		GlobuleAddress_Facet
	} from '#lib/projection-geometry/types.js';
	import {
		geometrySourceOfPattern,
		patternBandToReal
	} from '#lib/cut-pattern/pattern-band-space.js';
	import { buildPatternBandMesh } from '#lib/pattern-on-model/band-uv-mesh.js';
	import { rasterizeBand } from '#lib/pattern-on-model/rasterize-band.js';
	import type { BandCutPattern } from '#lib/types.js';

	const LATTICE_COLOR = '#000000';
	/** Holes read as solid white on screen; they still let the interior light through. */
	const HOLE_COLOR = '#ffffff';
	/** The shadow texture leaves holes clear, so the caster cuts them out. */
	const SHADOW_HOLE_COLOR = 'rgba(0, 0, 0, 0)';
	const SHADOW_ALPHA_TEST = 0.5;
	/** Selection render mode: bands that are neither highlighted nor filtered. */
	const GHOST_OPACITY = 0.08;

	/** What a visible band mesh carries for picking and marking. */
	type BandMeshData = { real: GlobuleAddress_Band; facetIndices: Int32Array };

	// Selected / partner facets over the pattern: translucent, pulled toward the
	// camera so they never z-fight the band beneath. Static (module-level), so no
	// Three.js object enters Svelte state.
	const facetMark = (color: Color) =>
		new MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.55,
			depthWrite: false,
			side: DoubleSide,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		});
	const facetMarks = {
		selected: facetMark(materials.selected.color),
		partner: facetMark(materials.highlightedPrimary.color),
		startPartner: facetMark(materials.numbered[4].color),
		endPartner: facetMark(materials.numbered[1].color)
	};
	const TINT = {
		none: new Color('#ffffff'),
		primary: new Color(HIGHLIGHT_PRIMARY),
		secondary: new Color(HIGHLIGHT_SECONDARY),
		filtered: new Color(PATTERN_FILTERED)
	};
	const noRaycast = () => {};

	let enabled = $derived($patternOnModelStore.enabled);
	let density = $derived($patternOnModelStore.density);
	let interiorLight = $derived($patternOnModelStore.interiorLight);

	let group: Group | null = $state.raw(null);
	// The live group, read by the effect without subscribing to `group` (which it
	// writes) and by onDestroy.
	let current: Group | null = null;
	const swap = (next: Group | null) => {
		const previous = current;
		current = next;
		group = next;
		dispose(previous);
	};
	let center: [number, number, number] = $state.raw([0, 0, 0]);
	let radius = $state(1);

	const dispose = (g: Group | null) => {
		g?.traverse((o) => {
			if (!(o instanceof Mesh)) return;
			o.geometry.dispose();
			// The shadow twin shares geometry and texture; disposing twice is harmless.
			const material = o.material as MeshStandardMaterial | MeshBasicMaterial;
			material.map?.dispose();
			material.dispose();
		});
	};

	/** Outlined bands lead with an outline facet that has no quad. */
	const isOutlined = (band: BandCutPattern) =>
		!!band.facets[0] && !band.facets[0].quad && band.facets.some((f) => f.quad);

	const build = (source: GeometrySource): Group => {
		const next = new Group();
		const spaceOf = $patternBandSpaces;
		const sg = $superGlobuleStore;
		for (const tube of $collatedTubesStore) {
			for (const band of tube.bands) {
				if (band.error) continue;
				const real = patternBandToReal(spaceOf(source, band.address.globule), band.address);
				if (!real) continue;
				const realBand = tubesForGeometrySource(sg, source, real.globule)?.[real.tube]?.bands[
					real.band
				];
				if (!realBand) continue;
				const mapped = buildPatternBandMesh(band, realBand.facets);
				if (!mapped) continue;

				const canvas = rasterizeBand(band, mapped.bounds, {
					density,
					color: LATTICE_COLOR,
					holeColor: HOLE_COLOR,
					outlined: isOutlined(band)
				});
				const texture = new CanvasTexture(canvas);
				texture.colorSpace = SRGBColorSpace;
				texture.anisotropy = 8;
				const shadowTexture = new CanvasTexture(
					rasterizeBand(band, mapped.bounds, {
						density,
						color: LATTICE_COLOR,
						holeColor: SHADOW_HOLE_COLOR,
						outlined: isOutlined(band)
					})
				);

				const geometry = new BufferGeometry();
				geometry.setAttribute('position', new BufferAttribute(mapped.positions, 3));
				geometry.setAttribute('uv', new BufferAttribute(mapped.uvs, 2));
				geometry.computeVertexNormals();

				// Opaque: holes are solid white, so nothing on screen is cut away.
				const material = new MeshStandardMaterial({
					map: texture,
					side: DoubleSide,
					roughness: 0.85,
					metalness: 0
				});
				const mesh = new Mesh(geometry, material);
				mesh.castShadow = false;
				mesh.receiveShadow = true;
				mesh.name = band.id;
				mesh.userData = { real, facetIndices: mapped.facetIndices } satisfies BandMeshData;
				next.add(mesh);

				// Shadows must cut the holes out so the interior light throws the
				// lattice, not the whole band — the holes are cut-outs in the real
				// piece, white only on screen. A custom depth/distance material cannot
				// do it: the shadow pass copies the visible material's alphaTest and map
				// over it. So an invisible twin (colorWrite off) casts the shadow from a
				// stroke-only texture (holes clear) with its own alphaTest.
				const caster = new Mesh(
					geometry,
					new MeshBasicMaterial({
						map: shadowTexture,
						alphaTest: SHADOW_ALPHA_TEST,
						colorWrite: false,
						depthWrite: false,
						side: DoubleSide
					})
				);
				caster.castShadow = true;
				caster.raycast = noRaycast;
				next.add(caster);
			}
		}
		return next;
	};

	let source: GeometrySource = $derived(geometrySourceOfPattern($patternSourceStore));

	$effect(() => {
		if (!enabled) {
			swap(null);
			return;
		}
		// Dependencies: the generated pattern, its source, the 3D tubes, density.
		void $collatedTubesStore;
		void $superGlobuleStore;
		void $patternBandSpaces;
		void density;
		const started = performance.now();
		const next = build(source);
		const box = new Box3().setFromObject(next);
		if (!box.isEmpty()) {
			const c = box.getCenter(new Vector3());
			center = [c.x, c.y, c.z];
			radius = Math.max(1, box.getSize(new Vector3()).length() / 2);
		}
		console.info(
			`[pattern-on-model] ${next.children.length / 2} bands textured in ${Math.round(performance.now() - started)} ms`
		);
		swap(next);
	});

	onDestroy(() => swap(null));

	// --- Marking: band highlight tint and Selection-mode ghosting -------------
	// Material colour × texture: white holes take the tint, black lines stay
	// black. A uniform change, so a highlight never re-rasterises anything.
	$effect(() => {
		const g = group;
		const state = $bandHighlightState;
		if (!g) return;
		const highlight = state.highlightFor(source);
		for (const child of g.children) {
			const data = child.userData as Partial<BandMeshData>;
			if (!data.real || !(child instanceof Mesh)) continue;
			const material = child.material as MeshStandardMaterial;
			const isPrimary = !!highlight && sameGlobuleBand(data.real, highlight.band);
			const filtered = state.isFiltered(source, data.real);
			const isRing = !!highlight?.ring.some((b) => sameGlobuleBand(data.real!, b));
			const ghost = state.selectionView && !isPrimary && !filtered;
			const tint = state.selectionView
				? TINT.none
				: isPrimary
					? TINT.primary
					: filtered
						? TINT.filtered
						: isRing
							? TINT.secondary
							: TINT.none;
			material.color.copy(tint);
			if (material.transparent !== ghost) {
				material.transparent = ghost;
				material.depthWrite = !ghost;
				material.needsUpdate = true;
			}
			material.opacity = ghost ? GHOST_OPACITY : 1;
		}
	});

	// --- Picking ---------------------------------------------------------------
	// Same behaviour as the hidden meshes: where this source shows facet meshes, a
	// click selects the facet (partners, band log, Assembler highlight); where it
	// shows only bands, it drives the Assembler highlight alone. Surface sources
	// always render facets.
	let facetsShown = $derived(
		source === 'projection'
			? $viewControlStore.showProjectionGeometry.facets
			: source === 'voronoi'
				? $viewControlStore.showVoronoiGeometry.facets
				: source === 'globuleTube'
					? $viewControlStore.showGlobuleTubeGeometry.facets
					: true
	);

	const setSelectedFacet = (s: GeometrySource) => (a: GlobuleAddress_Facet) => {
		if (s === 'projection') selectedProjection.set(a);
		else if (s === 'surfaceProjection') selectedSurfaceProjection.set(a);
		else if (s === 'voronoi') selectedVoronoi.set(a);
		else if (s === 'voronoiSurface') selectedVoronoiSurface.set(a);
		else if (s === 'globuleTube') selectedGlobuleTube.set(a);
	};

	type OverlayClick = {
		object?: unknown;
		faceIndex?: number | null;
		point?: Vector3;
		intersections?: { object: unknown }[];
		stopPropagation?: () => void;
	};
	const handleClick = (ev: OverlayClick) => {
		const data = (ev.object as Mesh | undefined)?.userData as Partial<BandMeshData> | undefined;
		if (!data?.real || !data.facetIndices) return;
		const facet = ev.faceIndex == null ? undefined : data.facetIndices[ev.faceIndex];
		if (facetsShown && facet !== undefined) {
			handleFacetSelect(ev, source, { ...data.real, facet }, setSelectedFacet(source));
			return;
		}
		if (isMeasureInteractionMode(get(interactionMode))) {
			ev.stopPropagation?.();
			const vertex = nearestVertexFromEvent(ev);
			if (vertex) addMeasurementPoint(vertex);
			return;
		}
		ev.stopPropagation?.();
		highlightRealBand(source, data.real);
	};

	// --- Selected / partner facets of this source ----------------------------
	let selectedGeometry = $derived(
		source === 'projection'
			? $selectedProjectionGeometry
			: source === 'surfaceProjection'
				? $selectedSurfaceProjectionGeometry
				: source === 'voronoi'
					? $selectedVoronoiGeometry
					: source === 'voronoiSurface'
						? $selectedVoronoiSurfaceGeometry
						: source === 'globuleTube'
							? $selectedGlobuleTubeGeometry
							: undefined
	);
	let facetMarkGeometries = $derived(
		selectedGeometry?.selected?.length && !$bandHighlightState.selectionView
			? (['selected', 'partner', 'startPartner', 'endPartner'] as const)
					.map((role) => ({
						role,
						geometry:
							role === 'selected'
								? selectedGeometry.geometry.facet
								: selectedGeometry.geometry[role]
					}))
					.filter((m) => !!m.geometry)
			: []
	);
</script>

{#if group}
	<T is={group} onclick={handleClick} />
	{#each facetMarkGeometries as mark (mark.role)}
		<T.Mesh geometry={mark.geometry} material={facetMarks[mark.role]} raycast={noRaycast} />
	{/each}
	{#if interiorLight}
		<T.PointLight
			position={center}
			intensity={3}
			decay={0}
			castShadow
			shadow.mapSize.width={2048}
			shadow.mapSize.height={2048}
			shadow.bias={-0.002}
			shadow.camera.near={1}
			shadow.camera.far={radius * 20}
			color="#ffd9a0"
		/>
		<!-- Warm bulb marker at the light, and a room to throw the lattice onto. -->
		<T.Mesh position={center} raycast={noRaycast}>
			<T.SphereGeometry args={[radius * 0.03, 16, 12]} />
			<T.MeshBasicMaterial color="#fff1d6" />
		</T.Mesh>
		<T.Mesh position={center} receiveShadow raycast={noRaycast}>
			<T.SphereGeometry args={[radius * 6, 64, 32]} />
			<T.MeshStandardMaterial color="#cfc9bf" side={BackSide} roughness={1} />
		</T.Mesh>
	{/if}
{/if}
