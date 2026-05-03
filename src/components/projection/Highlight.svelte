<script lang="ts">
	import { materials } from '../three-renderer/materials';
	import { selectedProjectionGeometry, chooserPairGeometry } from '$lib/stores';
	import { T } from '@threlte/core';

	const chooserActive = $derived(
		Boolean($chooserPairGeometry?.startGeometry || $chooserPairGeometry?.endGeometry)
	);
</script>

{#if $selectedProjectionGeometry && !chooserActive}
	<T.Mesh
		geometry={$selectedProjectionGeometry.geometry.facet}
		material={materials.highlightedSecondary}
	/>
	{#if $selectedProjectionGeometry.geometry.partner}
		<T.Mesh
			geometry={$selectedProjectionGeometry.geometry.partner}
			material={materials.numbered[3]}
		/>
	{/if}
{/if}

{#if $chooserPairGeometry?.startGeometry}
	<T.Mesh geometry={$chooserPairGeometry.startGeometry} material={materials.numbered[4]} />
{/if}
{#if $chooserPairGeometry?.endGeometry}
	<T.Mesh geometry={$chooserPairGeometry.endGeometry} material={materials.numbered[1]} />
{/if}
