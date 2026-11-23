<script lang="ts">
	import { materials } from '../three-renderer/materials';
	import {
		selectedProjectionGeometry,
		partnerHighlightGeometry,
		patternSourceStore
	} from '#lib/stores/index.js';
	import { patternOnModelStore } from '#lib/stores/patternOnModelStore.js';
	import { geometrySourceOfPattern } from '#lib/cut-pattern/pattern-band-space.js';
	import type { HighlightRole } from '#lib/stores/selectionStores.js';
	import { T } from '@threlte/core';

	const partnerActive = $derived($partnerHighlightGeometry.length > 0);
	// Pattern on model draws the projection selection itself (translucent, over
	// the pattern); this opaque copy would sit in the same plane and z-fight it.
	const overlaid = $derived(
		$patternOnModelStore.enabled && geometrySourceOfPattern($patternSourceStore) === 'projection'
	);

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

{#if $selectedProjectionGeometry && !partnerActive && !overlaid}
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
