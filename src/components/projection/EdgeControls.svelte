<script lang="ts">
	import { getCrossSection, getEdge } from '$lib/projection-geometry/functions';
	import { superConfigStore } from '$lib/stores';
	import { get } from 'svelte/store';
	type PathEditorMode = 'edit' | 'view' | 'mini';

	let {
		address,
		toggleEditorMode
	}: {
		address: [number, number, number];
		toggleEditorMode: () => void;
	} = $props();

	const [projectionIndex, polygonIndex, edgeIndex] = address;
	const handleClickRecalculate = () => {};

	const copyEdgeCurve = (address: [number, number, number]): number => {
		const config = get(superConfigStore);
		const indexOfCurve = getEdge(config.projectionConfigs, address).widthCurve;
		const newCurve = window.structuredClone(
			config.projectionConfigs[address[0]].projectorConfig.polyhedron.edgeCurves[
				indexOfCurve
			]
		);
		config.projectionConfigs[address[0]].projectorConfig.polyhedron.edgeCurves.push(
			newCurve
		);
		const newIndex =
			config.projectionConfigs[address[0]].projectorConfig.polyhedron.edgeCurves.length -
			1;
		superConfigStore.set(config);
		return newIndex;
	};

	const handleClickMakeUnique = (address: [number, number, number]) => {
		const config = get(superConfigStore);
		config.projectionConfigs[address[0]].projectorConfig.polyhedron.polygons[
			address[1]
		].edges[address[2]].widthCurve = copyEdgeCurve(address);
		superConfigStore.set(config);
	};

	const handleClickEditCrossSection = (address: [number, number, number]) => {
		toggleEditorMode();
		const config = get(superConfigStore);
		const { crossSectionDef, crossSectionIndex } = getCrossSection(
			config.projectionConfigs,
			address
		);
	};
</script>

<div>
	<button onclick={handleClickRecalculate}> Recalculate Model </button>
	{#if address[2] !== undefined}
		<button onclick={() => handleClickMakeUnique(address)}>Make Unique</button>
		<button onclick={() => handleClickEditCrossSection(address)}>Edit Cross Section</button>
	{/if}
	<div>
		{`${address[0]} ${address[1]} ${address[2]}`}
	</div>
</div>

<style>
</style>
