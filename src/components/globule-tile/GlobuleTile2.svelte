<script lang="ts">
	import type { GlobuleConfigType, GlobuleGeometry } from '$lib/types';
	import { Canvas, T } from '@threlte/core';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';
	import DesignerCamera from '../three-renderer-v2/DesignerCamera.svelte';
	import DesignerLighting from '../three-renderer-v2/DesignerLighting.svelte';
	import GlobuleTileContainer from './GlobuleTileContainer.svelte';
	import { goto } from '$app/navigation';

	export let size: number = 200;
	export let globuleGeometry: GlobuleGeometry;
	export let onDelete: (id: number) => Promise<Response>;
	export let onLoad: (id: number, addToExisting: boolean) => void;

	// const { name, globuleConfigId } = globuleGeometry;
</script>

<GlobuleTileContainer name={globuleGeometry.name || ''} id={globuleGeometry.globuleConfigId || ''} {size}>
	<button
		on:click={() => {
			onLoad(Number.parseInt(`${globuleGeometry.globuleConfigId}`), false), goto('/designer2');
		}}>Load into New Designer</button
	>
	<button
		on:click={() => {
			onLoad(Number.parseInt(`${globuleGeometry.globuleConfigId}`), true), goto('/designer2');
		}}>Add to Designer</button
	>

	<button on:click={() => onDelete(Number.parseInt(`${globuleGeometry.globuleConfigId}`))}>Delete</button>

	<Canvas slot="globule-tile-3d" size={{ width: size, height: size }}>
		<DesignerCamera />
		<DesignerLighting />
		<T.Group position={[0, 0, 0]}>
			<GlobuleMesh geometry={globuleGeometry} material="default" />
		</T.Group>
	</Canvas>
</GlobuleTileContainer>
