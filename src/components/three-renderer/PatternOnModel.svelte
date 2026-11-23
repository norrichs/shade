<script lang="ts">
	/**
	 * View → "Pattern on model": every pattern band rasterised (raw strokes, no
	 * Prepare union) onto the 3D band it was cut from, as a decal LAYER over the
	 * normal band meshes. UVs are the band's own path space
	 * (`buildPatternBandMesh`), so the GPU clips anything that spills past the
	 * band. Strokes are black, holes fully transparent (alphaTest); the layer sits
	 * exactly on the band surface.
	 *
	 * The normal meshes underneath keep picking and highlighting; they draw in
	 * `materials.patternModel` (user colour/opacity) where they would otherwise
	 * show a plain base colour — see ProjectionGeometryComponent.
	 *
	 * Meshes are built imperatively into one Group held in `$state.raw` — Three.js
	 * objects in deep `$state` trip Svelte's effect-depth limit (GlobuleMesh notes).
	 */
	import { T, useThrelte } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import {
		BackSide,
		BufferAttribute,
		BufferGeometry,
		CanvasTexture,
		DoubleSide,
		Group,
		Mesh,
		MeshStandardMaterial,
		SRGBColorSpace
	} from 'three';
	import {
		collatedTubesStore,
		patternBandSpaces,
		patternSourceStore,
		superGlobuleStore,
		tubesForGeometrySource,
		type GeometrySource
	} from '#lib/stores/index.js';
	import { patternOnModelStore } from '#lib/stores/patternOnModelStore.js';
	import { bandHighlightState } from '#lib/stores/bandHighlightStore.js';
	import { sameGlobuleBand } from '#lib/assembler-highlight.js';
	import {
		geometrySourceOfPattern,
		patternBandToReal
	} from '#lib/cut-pattern/pattern-band-space.js';
	import {
		buildPatternBandMesh,
		type PatternBandMesh
	} from '#lib/pattern-on-model/band-uv-mesh.js';
	import { rasterizeBand } from '#lib/pattern-on-model/rasterize-band.js';
	import type { BandCutPattern } from '#lib/types.js';
	import type { GlobuleAddress_Band } from '#lib/projection-geometry/types.js';

	const LATTICE_COLOR = '#000000';
	const HOLE_COLOR = 'rgba(0, 0, 0, 0)';
	/** Selection render mode: the pattern on bands that are neither highlighted nor filtered. */
	const GHOST_OPACITY = 0.08;
	const noRaycast = () => {};

	const { invalidate } = useThrelte();
	let enabled = $derived($patternOnModelStore.enabled);
	let density = $derived($patternOnModelStore.density);
	let interiorLight = $derived($patternOnModelStore.interiorLight);
	let source: GeometrySource = $derived(geometrySourceOfPattern($patternSourceStore));

	let group: Group | null = $state.raw(null);
	// The live group, read by the effect without subscribing to `group` (which it
	// writes) and by onDestroy.
	let current: Group | null = null;
	let center: [number, number, number] = $state.raw([0, 0, 0]);
	let radius = $state(1);

	const dispose = (g: Group | null) => {
		g?.traverse((o) => {
			if (!(o instanceof Mesh)) return;
			o.geometry.dispose();
			const material = o.material as MeshStandardMaterial;
			material.map?.dispose();
			material.dispose();
		});
	};
	const swap = (next: Group | null) => {
		const previous = current;
		current = next;
		group = next;
		dispose(previous);
	};

	/** Outlined bands lead with an outline facet that has no quad. */
	const isOutlined = (band: BandCutPattern) =>
		!!band.facets[0] && !band.facets[0].quad && band.facets.some((f) => f.quad);

	type Mapped = { band: BandCutPattern; real: GlobuleAddress_Band; mapped: PatternBandMesh };

	/** Every pattern band with its real 3D band and UV mesh. */
	const mapBands = (): Mapped[] => {
		const out: Mapped[] = [];
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
				if (mapped) out.push({ band, real, mapped });
			}
		}
		return out;
	};

	/** Center and radius of the model, from the band meshes' own positions. */
	const boundsOf = (items: Mapped[]) => {
		const min = [Infinity, Infinity, Infinity];
		const max = [-Infinity, -Infinity, -Infinity];
		for (const { mapped } of items) {
			const p = mapped.positions;
			for (let i = 0; i < p.length; i += 3)
				for (let k = 0; k < 3; k++) {
					if (p[i + k] < min[k]) min[k] = p[i + k];
					if (p[i + k] > max[k]) max[k] = p[i + k];
				}
		}
		if (!items.length) return { c: { x: 0, y: 0, z: 0 }, r: 1 };
		return {
			c: { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 },
			r: Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2)
		};
	};

	const build = (items: Mapped[]): Group => {
		const next = new Group();
		for (const { band, real, mapped } of items) {
			const texture = new CanvasTexture(
				rasterizeBand(band, mapped.bounds, {
					density,
					color: LATTICE_COLOR,
					holeColor: HOLE_COLOR,
					outlined: isOutlined(band)
				})
			);
			texture.colorSpace = SRGBColorSpace;
			texture.anisotropy = 8;

			const geometry = new BufferGeometry();
			geometry.setAttribute('position', new BufferAttribute(mapped.positions, 3));
			geometry.setAttribute('uv', new BufferAttribute(mapped.uvs, 2));
			geometry.computeVertexNormals();

			const material = new MeshStandardMaterial({
				map: texture,
				// Strokes are ~1 unit on bands ~100 wide, so at overview zoom the mip
				// levels average a line's alpha well under 0.5 and a plain alphaTest
				// at 0.5 breaks it into dashes. A low threshold keeps thin lines alive
				// further down the mip chain, and alpha-to-coverage (MSAA) smooths
				// their edges. The shadow pass uses the same cut-out, so the interior
				// light throws the lattice.
				alphaTest: 0.2,
				alphaToCoverage: true,
				// Coplanar with the band, so draw ORDER decides who wins, not an
				// offset: as a transparent pass with renderOrder 1 the layer draws
				// after the (transparent) model material and, at equal depth, on top
				// of it. Opaque, it would draw first and the base would wash it out.
				transparent: true,
				side: DoubleSide,
				roughness: 0.85,
				metalness: 0
			});
			const mesh = new Mesh(geometry, material);
			mesh.renderOrder = 1;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			// The normal band meshes underneath take the clicks.
			mesh.raycast = noRaycast;
			mesh.name = band.id;
			mesh.userData = { real };
			next.add(mesh);
		}
		return next;
	};

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
		const items = mapBands();
		const { c, r } = boundsOf(items);
		const next = build(items);
		center = [c.x, c.y, c.z];
		radius = r;
		console.info(
			`[pattern-on-model] ${next.children.length} bands textured in ${Math.round(performance.now() - started)} ms`
		);
		swap(next);
	});

	onDestroy(() => swap(null));

	// Selection render mode ghosts the bands that are neither highlighted nor
	// filtered; the pattern on them fades with them.
	$effect(() => {
		const g = group;
		const state = $bandHighlightState;
		if (!g) return;
		const highlight = state.highlightFor(source);
		for (const child of g.children) {
			const real = (child.userData as { real?: GlobuleAddress_Band }).real;
			if (!real || !(child instanceof Mesh)) continue;
			const material = child.material as MeshStandardMaterial;
			const marked =
				(!!highlight && sameGlobuleBand(real, highlight.band)) || state.isFiltered(source, real);
			const ghost = state.selectionView && !marked;
			material.depthWrite = !ghost;
			material.opacity = ghost ? GHOST_OPACITY : 1;
		}
		// Threlte renders on demand; an in-place material edit asks for no frame.
		invalidate();
	});
</script>

{#if group}
	<T is={group} />
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
