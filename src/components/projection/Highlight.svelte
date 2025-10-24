<script lang="ts">
	import { materials } from '../three-renderer/materials';
	import { selectedProjectionGeometry } from '$lib/stores';
	import { T } from '@threlte/core';
</script>

{#if $selectedProjectionGeometry}
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
