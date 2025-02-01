<script lang="ts">
	import type { GlobuleConfigType, GlobuleGeometry, SuperGlobuleGeometry } from '$lib/types';
	import { Canvas, T } from '@threlte/core';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';
	import DesignerCamera from '../three-renderer-v2/DesignerCamera.svelte';
	import DesignerLighting from '../three-renderer-v2/DesignerLighting.svelte';
	import GlobuleTileContainer from './GlobuleTileContainer.svelte';
	import { goto } from '$app/navigation';

	export let size: number = 200;
	export let superGlobuleGeometry: SuperGlobuleGeometry;
	export let onDelete: (id: number) => Promise<Response>;
	export let onLoad: (id: number, addToExisting: boolean) => void;

</script>

<GlobuleTileContainer name={superGlobuleGeometry.name || ''} id={superGlobuleGeometry.superGlobuleConfigId || ''} {size}>
	<button
		on:click={() => {
			onLoad(Number.parseInt(`${superGlobuleGeometry.superGlobuleConfigId}`), false), goto('/designer2');
		}}>Load into New Designer</button
	>
	<button
		on:click={() => {
			onLoad(Number.parseInt(`${superGlobuleGeometry.superGlobuleConfigId}`), true), goto('/designer2');
		}}>Add to Designer</button
	>

	<button on:click={() => onDelete(Number.parseInt(`${superGlobuleGeometry.superGlobuleConfigId}`))}>Delete</button>

	<Canvas slot="globule-tile-3d" size={{ width: size, height: size }}>
		<DesignerCamera />
		<DesignerLighting />
		<T.Group position={[0, 0, 0]}>
			{#each superGlobuleGeometry.subGlobules as globuleGeometry}
				<GlobuleMesh geometry={globuleGeometry} selected={false} />
			{/each}
		</T.Group>
	</Canvas>
</GlobuleTileContainer>
