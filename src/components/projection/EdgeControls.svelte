<script lang="ts">
	import { getCrossSection, getEdge } from '$lib/projection-geometry/functions';
	import { superConfigStore } from '$lib/stores';
	type PathEditorMode = 'edit' | 'view' | 'mini';
	export let address;
	export let toggleEditorMode: () => void;

	const [projectionIndex, polygonIndex, edgeIndex] = address;
	const handleClickRecalculate = () => {
		console.debug('Recalculate?', { address });

		console.debug(
			$superConfigStore.projectionConfigs[projectionIndex].projectorConfig.polyhedron.polygons[
				polygonIndex
			]
		);
	};

	// const getEdge = (address: [number, number, number]) => {
	// 	return $superConfigStore.projectionConfigs[address[0]].projectorConfig.polyhedron.polygons[
	// 		address[1]
	// 	].edges[address[2]];
	// };
	// const getCrossSection = (address: [number, number, number]) => {
	// 	const index = getEdge(address).crossSectionCurve;

	// 	return {
	// 		crossSectionDef:
	// 			$superConfigStore.projectionConfigs[address[0]].projectorConfig.polyhedron
	// 				.crossSectionCurves[index],
	// 		crossSectionIndex: index
	// 	};
	// };

	const copyEdgeCurve = (address: [number, number, number]): number => {
		const indexOfCurve = getEdge($superConfigStore.projectionConfigs, address).widthCurve;
		const newCurve = window.structuredClone(
			$superConfigStore.projectionConfigs[address[0]].projectorConfig.polyhedron.edgeCurves[
				indexOfCurve
			]
		);
		$superConfigStore.projectionConfigs[address[0]].projectorConfig.polyhedron.edgeCurves.push(
			newCurve
		);
		const newIndex =
			$superConfigStore.projectionConfigs[address[0]].projectorConfig.polyhedron.edgeCurves.length -
			1;
		console.debug('copyEdgeCurve', {
			indexOfCurve,
			newCurve,
			newIndex,
			edgeCurves:
				$superConfigStore.projectionConfigs[address[0]].projectorConfig.polyhedron.edgeCurves
		});
		return newIndex;
	};

	const handleClickMakeUnique = (address: [number, number, number]) => {
		console.debug('handleClickMakeUnique', address);
		$superConfigStore.projectionConfigs[address[0]].projectorConfig.polyhedron.polygons[
			address[1]
		].edges[address[2]].widthCurve = copyEdgeCurve(address);

		console.debug({
			polyhedron: $superConfigStore.projectionConfigs[projectionIndex].projectorConfig.polyhedron
		});
	};

	const handleClickEditCrossSection = (address: [number, number, number]) => {
		toggleEditorMode();
		const { crossSectionDef, crossSectionIndex } = getCrossSection(
			$superConfigStore.projectionConfigs,
			address
		);
		console.debug('crossSection', { crossSectionDef, crossSectionIndex });
	};
</script>

<div>
	<button on:click={handleClickRecalculate}> Recalculate Model </button>
	{#if address[2] !== undefined}
		<button on:click={() => handleClickMakeUnique(address)}>Make Unique</button>
		<button on:click={() => handleClickEditCrossSection(address)}>Edit Cross Section</button>
	{/if}
	<div>
		{`${address[0]} ${address[1]} ${address[2]}`}
	</div>
</div>

<style>
</style>
