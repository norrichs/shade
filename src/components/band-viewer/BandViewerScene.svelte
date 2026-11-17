<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import {
		BackSide,
		BufferAttribute,
		BufferGeometry,
		FrontSide,
		LineBasicMaterial,
		MeshStandardMaterial,
		PerspectiveCamera,
		Vector3
	} from 'three';
	import type { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { untrack } from 'svelte';
	import DesignerLighting from '../three-renderer/DesignerLighting.svelte';
	import { applyUnfold, type UnfoldPlan } from '#lib/band-viewer/unfold-band.js';

	let {
		plan,
		flatten,
		frameKey
	}: {
		plan: UnfoldPlan;
		/** Flatten fraction, 0 (as modelled) … 1 (flat). */
		flatten: number;
		/** Identity of the shown band; the camera reframes only when it changes. */
		frameKey: string;
	} = $props();

	const FOV = 30;
	const { invalidate } = useThrelte();

	// Opaque front / back so which side faces where is never ambiguous; the faces
	// are pushed back a little so the edge lines draw cleanly on top.
	const frontMaterial = new MeshStandardMaterial({
		color: '#d3d3d3',
		side: FrontSide,
		polygonOffset: true,
		polygonOffsetFactor: 1,
		polygonOffsetUnits: 1
	});
	const backMaterial = new MeshStandardMaterial({
		color: '#555555',
		side: BackSide,
		polygonOffset: true,
		polygonOffsetFactor: 1,
		polygonOffsetUnits: 1
	});
	const lineMaterial = new LineBasicMaterial({ color: '#1e5bff' });

	// Three.js objects are built per plan with $derived (not $state), so Svelte
	// never proxies them; slider ticks only rewrite the shared position buffer.
	const geometry = $derived.by(() => {
		const positions = new BufferAttribute(new Float32Array(plan.facetCount * 9), 3);
		const faces = new BufferGeometry().setAttribute('position', positions);
		const edges = new BufferGeometry().setAttribute('position', positions);
		const index: number[] = [];
		for (let f = 0; f < plan.facetCount; f++) {
			const i = f * 3;
			index.push(i, i + 1, i + 1, i + 2, i + 2, i);
		}
		edges.setIndex(index);
		return { positions, faces, edges };
	});

	$effect(() => {
		const { faces, edges } = geometry;
		return () => {
			faces.dispose();
			edges.dispose();
		};
	});

	$effect(() => {
		const { positions, faces, edges } = geometry;
		applyUnfold(plan, flatten, positions.array as Float32Array);
		positions.needsUpdate = true;
		faces.computeVertexNormals();
		faces.computeBoundingSphere();
		edges.computeBoundingSphere();
		invalidate();
	});

	let camera: PerspectiveCamera | undefined = $state();
	let controls: ThreeOrbitControls | undefined = $state();
	let framedKey: string | undefined;

	// Face the anchor's front side, world +Z up (the model's vertical), far enough
	// back that both the modelled and the flat shape fit.
	$effect(() => {
		const key = frameKey;
		if (!camera || !controls || key === framedKey) return;
		framedKey = key;
		const p = untrack(() => plan);
		const radius = Math.max(p.radius, 1e-3);
		// Fit the narrower of the vertical and horizontal fields of view: the band
		// pane is usually much taller than wide.
		const halfV = ((FOV / 2) * Math.PI) / 180;
		const halfH = Math.atan(Math.tan(halfV) * (camera.aspect || 1));
		const distance = (1.1 * radius) / Math.sin(Math.min(halfV, halfH));
		const position = p.centroid.clone().addScaledVector(p.anchorNormal, distance);
		// Looking straight along Z would leave "up" undefined; tip slightly off-axis.
		if (Math.abs(p.anchorNormal.dot(new Vector3(0, 0, 1))) > 0.99) {
			position.y += 0.05 * distance;
		}
		camera.position.copy(position);
		camera.near = distance / 100;
		camera.far = distance * 10;
		camera.updateProjectionMatrix();
		controls.target.copy(p.centroid);
		controls.update();
		invalidate();
	});
</script>

<T.PerspectiveCamera makeDefault bind:ref={camera} up={[0, 0, 1]} fov={FOV} near={1} far={10000}>
	<OrbitControls bind:ref={controls} enableZoom={true} />
</T.PerspectiveCamera>
<DesignerLighting />

<T.Mesh geometry={geometry.faces} material={frontMaterial} />
<T.Mesh geometry={geometry.faces} material={backMaterial} />
<T.LineSegments geometry={geometry.edges} material={lineMaterial} />
