<script lang="ts">
	/**
	 * Marks where rays are cast from for an imported surface. Driven by the
	 * config, not panel state — sidebar panels unmount when closed.
	 * Static geometry/material only: Three.js objects in $state trip Svelte's
	 * effect-depth limit (see GlobuleMesh notes).
	 */
	import { T } from '@threlte/core';
	import { superConfigStore } from '$lib/stores';

	let center = $derived.by(() => {
		const surface = $superConfigStore.projectionConfigs[0]?.surfaceConfig;
		return surface?.type === 'ImportedMeshConfig' ? surface.center : null;
	});
</script>

{#if center}
	<T.Mesh position={[center.x, center.y, center.z]} renderOrder={999}>
		<T.SphereGeometry args={[6, 16, 12]} />
		<T.MeshBasicMaterial color="#ff2fa0" depthTest={false} transparent opacity={0.9} />
	</T.Mesh>
{/if}
