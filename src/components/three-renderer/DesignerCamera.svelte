<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { degToRad } from '$lib/patterns/utils';
	import { isCameraInteracting } from '$lib/stores/uiStores';
	import { viewControlStore } from '$lib/stores';
	import { Vector3 } from 'three';

	const INITIAL_POSITION: [number, number, number] = [0, 2000, -5];

	let {
		distance = 2000,
		direction
	}: {
		distance?: number;
		direction?: { x: number; y: number; z: number };
	} = $props();

	const { camera, invalidate } = useThrelte();
	let controls: any = $state(null);

	// Only reposition camera when direction is explicitly set (not on mount)
	$effect(() => {
		if (!direction) return;
		const positionVector = new Vector3(direction.x, direction.y, direction.z).setLength(distance);
		$camera.position.set(positionVector.x, positionVector.y, positionVector.z);
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

<T.PerspectiveCamera makeDefault position={INITIAL_POSITION} fov={30} near={1} far={10000}>
	<OrbitControls
		bind:ref={controls}
		maxPolarAngle={degToRad(160)}
		enableZoom={true}
		target={[0, 0, 0]}
		onstart={handleInteractionStart}
		onend={handleInteractionEnd}
	/>
</T.PerspectiveCamera>
