<script lang="ts">
	import { T } from '@threlte/core';
	import {
		superGlobuleBandGeometryStore as geometryStore,
		selectedBand,
		viewControlStore as view
	} from '$lib/stores';
	import { interactionMode } from './interaction-mode';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';

	let { getInteractionMaterial, handleClick }: { getInteractionMaterial: any; handleClick: any } = $props();
</script>

{#if $view.showGlobuleGeometry.any}
	{#if $geometryStore.variant === 'Band'}
		{#each $geometryStore.subGlobules as glob}
			{#each glob as bandGeometry}
				{#if typeof bandGeometry !== 'undefined'}
					<T.Group position={[0, 0, 0]} onclick={(ev) => handleClick(ev, bandGeometry)}>
						<GlobuleMesh
							geometry={bandGeometry}
							material={getInteractionMaterial(bandGeometry, $interactionMode, $selectedBand)}
						/>
					</T.Group>
				{/if}
			{/each}
		{/each}
	{/if}
{/if}
