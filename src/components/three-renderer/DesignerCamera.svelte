<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { degToRad } from '$lib/patterns/utils';
	import { isCameraInteracting } from '$lib/stores/uiStores';
	import { viewControlStore } from '$lib/stores';

	let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
	let savedFacetsState = true; // Remember user's facets preference

	/**
	 * Camera interaction started (user is rotating/panning/zooming)
	 * Hide facets for better performance during interaction (only if they're currently visible)
	 */
	function handleInteractionStart() {
		isCameraInteracting.set(true);

		// Clear any pending debounce
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
			debounceTimeout = null;
		}

		// Save current facets state
		savedFacetsState = $viewControlStore.showProjectionGeometry.facets;

		// Only optimize if facets are currently visible
		if (savedFacetsState) {
			console.log('🎥 Camera interaction START - hiding facets for performance');
			$viewControlStore.showProjectionGeometry.facets = false;
			$viewControlStore.showProjectionGeometry.bands = true;
		} else {
			console.log('🎥 Camera interaction START - facets already hidden, no optimization needed');
		}
	}

	/**
	 * Camera interaction ended (user stopped moving camera)
	 * Wait 100ms before restoring full detail (debounce)
	 */
	function handleInteractionEnd() {
		// Debounce: wait 100ms after user stops moving before showing full detail
		debounceTimeout = setTimeout(() => {
			isCameraInteracting.set(false);

			// Only restore facets if they were originally visible
			if (savedFacetsState) {
				console.log('🎥 Camera interaction END - restoring facets');
				$viewControlStore.showProjectionGeometry.facets = true;
			} else {
				console.log('🎥 Camera interaction END - keeping facets hidden');
			}

			debounceTimeout = null;
		}, 100);
	}
</script>

<T.PerspectiveCamera makeDefault position={[0, 2000, -5]} fov={30} near={1} far={10000}>
	<OrbitControls
		maxPolarAngle={degToRad(160)}
		enableZoom={true}
		target={[0, 0.5, 0]}
		onstart={handleInteractionStart}
		onend={handleInteractionEnd}
	/>
</T.PerspectiveCamera>
