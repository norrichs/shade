<script lang="ts">
	import { materials } from '../three-renderer/materials';
	import { selectedProjectionGeometry, partnerHighlightGeometry } from '$lib/stores';
	import type { HighlightRole } from '$lib/stores/selectionStores';
	import { T } from '@threlte/core';

	const partnerActive = $derived($partnerHighlightGeometry.length > 0);

	const materialFor = (role: HighlightRole) => {
		if (role === 'base') return materials.partnerBase;
		if (role === 'top' || role === 'bottom') {
			// cross-tube uses red/green via numbered[]; same-band uses beige.
			// At this point we don't know if top/bottom is cross-tube; default to same-band.
			return materials.partnerWithinBand;
		}
		return materials.partnerAcrossBands;
	};
</script>

{#if $selectedProjectionGeometry && !partnerActive}
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

{#each $partnerHighlightGeometry as entry (entry.role)}
	<T.Mesh geometry={entry.geometry} material={materialFor(entry.role)} />
{/each}
