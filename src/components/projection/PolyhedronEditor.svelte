<script lang="ts">
	import { superConfigStore } from '$lib/stores';

	const PROJECTION_INDEX = 0;

	export let polyhedronConfig =
		$superConfigStore.projectionConfigs[PROJECTION_INDEX].projectorConfig.polyhedron;
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
