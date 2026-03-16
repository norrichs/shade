<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { degToRad } from '$lib/patterns/utils';
	import { isCameraInteracting } from '$lib/stores/uiStores';
	import { viewControlStore } from '$lib/stores';
	import { Vector3 } from 'three';

	let {
		distance = 2000,
		direction = { x: 0, y: 1, z: -0.0025 }
	}: {
		distance?: number;
		direction?: { x: number; y: number; z: number };
	} = $props();

	const DEFAULT_POSITION: [number, number, number] = [0, 2000, -5];

	// Calculate camera position from direction and distance
	let cameraPosition: [number, number, number] = $derived.by(() => {
		const positionVector = new Vector3(direction.x, direction.y, direction.z).setLength(distance);
		return [positionVector.x, positionVector.y, positionVector.z];
	});

	const { camera, invalidate } = useThrelte();
	let controls: any = $state(null);

	// When cameraPosition changes, update the actual camera position
	$effect(() => {
		const [x, y, z] = cameraPosition;
		$camera.position.set(x, y, z);
		$camera.lookAt(0, 0, 0);
		if (controls) controls.update();
		invalidate();
	});

	let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
	let savedFacetsState = true;

	function handleInteractionStart() {
		isCameraInteracting.set(true);
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
			debounceTimeout = null;
		}
		savedFacetsState = $viewControlStore.showProjectionGeometry.facets;
		if (savedFacetsState) {
			$viewControlStore.showProjectionGeometry.facets = false;
			$viewControlStore.showProjectionGeometry.bands = true;
		}
	}

	function handleInteractionEnd() {
		debounceTimeout = setTimeout(() => {
			isCameraInteracting.set(false);
			if (savedFacetsState) {
				$viewControlStore.showProjectionGeometry.facets = true;
			}
			debounceTimeout = null;
		}, 100);
	}
</script>

<T.PerspectiveCamera makeDefault position={DEFAULT_POSITION} fov={30} near={1} far={10000}>
	<OrbitControls
		bind:ref={controls}
		maxPolarAngle={degToRad(160)}
		enableZoom={true}
		target={[0, 0, 0]}
		onstart={handleInteractionStart}
		onend={handleInteractionEnd}
	/>
</T.PerspectiveCamera>
