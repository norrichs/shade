<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import { get } from 'svelte/store';

	const PROJECTION_INDEX = 0;

	let { projectionIndex = PROJECTION_INDEX }: { projectionIndex?: number } = $props();

	let polyhedronConfig = $derived(
		get(superConfigStore).projectionConfigs[projectionIndex].projectorConfig.polyhedron
	);
</script>

<section>
	<header>Polyhedron</header>
	<div>
		<div>
			<span>EdgeCurve 0 Divisions: {polyhedronConfig.edgeCurves[0].sampleMethod.divisions}</span>
			<input
				type="number"
				min="0"
				step="1"
				bind:value={
					$superConfigStore.projectionConfigs[PROJECTION_INDEX].projectorConfig.polyhedron
						.edgeCurves[0]
				}
			/>
			<button>Duplicate</button>
		</div>
	</div>
</section>
