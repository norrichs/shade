<script lang="ts">
	import { T } from '@threlte/core';
	import { interactivity } from '@threlte/extras';
	import { superGlobuleGeometryStore, selectedGlobule, superConfigStore } from '$lib/stores';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';
	import type { GlobuleGeometry, Id } from '$lib/types';
	import DesignerCamera from './DesignerCamera.svelte';
	import DesignerLighting from './DesignerLighting.svelte';

	interactivity();

	const CLICK_DELTA_THRESHOLD = 10;

	const selectGlobule = ({
		globuleConfigId,
		subGlobuleConfigId,
		subGlobuleRecurrence
	}: GlobuleGeometry) => {
		const subGlobuleConfigIndex =
			$superConfigStore.subGlobuleConfigs.findIndex(
				(subGlobuleConfig) => subGlobuleConfig.id === subGlobuleConfigId
			) || 0;
		const subGlobuleGeometryIndex = $superGlobuleGeometryStore.subGlobules.findIndex(
			(glob) =>
				glob.subGlobuleConfigId === subGlobuleConfigId &&
				glob.subGlobuleRecurrence === subGlobuleRecurrence
		);

		$selectedGlobule = {
			subGlobuleConfigIndex,
			subGlobuleConfigId,
			subGlobuleGeometryIndex,
			globuleId: globuleConfigId
		};
	};

	const handleClick = (event: any, globuleGeometry: GlobuleGeometry) => {
		console.debug("handleClick event", event)
		event.stopPropagation();
		if (event.delta < CLICK_DELTA_THRESHOLD) {
			selectGlobule(globuleGeometry);
		}
	};
</script>

<DesignerCamera />
<DesignerLighting />

{#each $superGlobuleGeometryStore.subGlobules as globuleGeometry, index}
	<T.Group
		position={[0, 0, 0]}
		on:click={(ev) => {
			handleClick(ev, globuleGeometry);
		}}
	>
		<GlobuleMesh {globuleGeometry} selected={$selectedGlobule.subGlobuleGeometryIndex === index} />
	</T.Group>
{/each}
