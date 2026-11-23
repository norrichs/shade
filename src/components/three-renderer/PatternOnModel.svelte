<script lang="ts">
	/**
	 * View → "Pattern on model": every pattern band rasterised (raw strokes, no
	 * Prepare union) onto the 3D band it was cut from. UVs are the band's own path
	 * space (`buildPatternBandMesh`), so the GPU clips anything that spills past
	 * the band. The stroke is the material (black); the holes are translucent
	 * white. The shadow pass cuts the holes out, so the interior light still
	 * throws the lattice.
	 *
	 * Meshes are built imperatively into one Group held in `$state.raw` — Three.js
	 * objects in deep `$state` trip Svelte's effect-depth limit (GlobuleMesh notes).
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
	import { patternOnModelStore } from '#lib/stores/patternOnModelStore.js';
	import {
		geometrySourceOfPattern,
		patternBandToReal
	} from '#lib/cut-pattern/pattern-band-space.js';
	import { buildPatternBandMesh } from '#lib/pattern-on-model/band-uv-mesh.js';
	import { rasterizeBand } from '#lib/pattern-on-model/rasterize-band.js';
	import type { BandCutPattern } from '#lib/types.js';

	const LATTICE_COLOR = '#000000';
	/** Holes read as translucent white (vellum-like), 75% opaque. */
	const HOLE_COLOR = 'rgba(255, 255, 255, 0.75)';
	/** Above the holes' alpha, below the strokes': the shadow pass's cut-out. */
	const SHADOW_ALPHA_TEST = 0.9;
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

	const build = (): Group => {
		const next = new Group();
		const source = geometrySourceOfPattern($patternSourceStore);
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

				const geometry = new BufferGeometry();
				geometry.setAttribute('position', new BufferAttribute(mapped.positions, 3));
				geometry.setAttribute('uv', new BufferAttribute(mapped.uvs, 2));
				geometry.computeVertexNormals();

				// Blended, not cut out: the holes are translucent white. Bands are
				// separate meshes, so Three sorts them back to front; depthWrite off
				// keeps a near band's holes from hiding the bands behind it.
				const material = new MeshStandardMaterial({
					map: texture,
					transparent: true,
					depthWrite: false,
					side: DoubleSide,
					roughness: 0.85,
					metalness: 0
				});
				const mesh = new Mesh(geometry, material);
				mesh.castShadow = false;
				mesh.receiveShadow = true;
				mesh.raycast = noRaycast;
				mesh.name = band.id;
				next.add(mesh);

				// Shadows must cut the holes out (strokes opaque, holes alpha 0.75) so the
				// interior light throws the lattice, not the whole band. A custom
				// depth/distance material cannot do it: the shadow pass copies the
				// visible material's alphaTest (0) over it. So an invisible twin
				// (colorWrite off) casts the shadow with its own alphaTest.
				const caster = new Mesh(
					geometry,
					new MeshBasicMaterial({
						map: texture,
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
		const next = build();
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
