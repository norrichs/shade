<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { degToRad } from '$lib/patterns/utils';
	import { isCameraInteracting, selectModeActive } from '$lib/stores/uiStores';
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

	let restoreTimeout: ReturnType<typeof setTimeout> | null = null;
	let hideTimeout: ReturnType<typeof setTimeout> | null = null;
	let savedFacetsState = true;
	let facetsHidden = false;

	// Orbiting hides facets (showing the cheap band meshes instead) for performance.
	// But OrbitControls fires `onstart` on EVERY pointer-down — including a plain click
	// meant to select a facet. If we hid the facets immediately, the facet mesh would be
	// gone by pointer-up and Threlte's `onclick` raycast would find nothing to select.
	// So defer the hide: only a sustained interaction (a real orbit) past this delay
	// swaps to the LOD view; a quick click cancels the pending hide in handleInteractionEnd,
	// leaving the facets present and clickable.
	const ORBIT_HIDE_DELAY = 400;

	function handleInteractionStart() {
		if (restoreTimeout) {
			clearTimeout(restoreTimeout);
			restoreTimeout = null;
		}
		// Capture the real visible state only when facets aren't already hidden, so a
		// rapid orbit -> pause -> orbit sequence doesn't latch savedFacetsState to false.
		if (!facetsHidden) {
			savedFacetsState = $viewControlStore.showProjectionGeometry.facets;
		}
		hideTimeout = setTimeout(() => {
			hideTimeout = null;
			isCameraInteracting.set(true);
			if (savedFacetsState) {
				$viewControlStore.showProjectionGeometry.facets = false;
				$viewControlStore.showProjectionGeometry.bands = true;
				facetsHidden = true;
			}
		}, ORBIT_HIDE_DELAY);
	}

	function handleInteractionEnd() {
		// Quick interaction (a click): the hide never fired — cancel it so the facets
		// stay in the scene and the click can select one.
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = null;
			return;
		}
		// Sustained orbit: restore facets shortly after the camera settles.
		restoreTimeout = setTimeout(() => {
			isCameraInteracting.set(false);
			if (savedFacetsState && facetsHidden) {
				$viewControlStore.showProjectionGeometry.facets = true;
			}
			facetsHidden = false;
			restoreTimeout = null;
		}, 100);
	}
</script>

<T.PerspectiveCamera makeDefault position={INITIAL_POSITION} fov={30} near={1} far={10000}>
	<OrbitControls
		bind:ref={controls}
		enabled={!$selectModeActive}
		maxPolarAngle={degToRad(160)}
		enableZoom={true}
		target={[0, 0, 0]}
		onstart={handleInteractionStart}
		onend={handleInteractionEnd}
	/>
</T.PerspectiveCamera>
