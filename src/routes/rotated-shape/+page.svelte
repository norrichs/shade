<script lang="ts">
	import ThreeRenderer from '../../components/three-renderer/ThreeRenderer.svelte';
	import CutPattern from '../../components/cut-pattern/CutPattern.svelte';
	import { generateRotatedShapeGeometry, type ZCurveConfig } from '../../lib/rotated-shape';
	import type { RotatedShapeGeometryConfig } from '../../lib/rotated-shape';
	import PathEdit from '../../components/path-edit/PathEdit.svelte';
	import { curveConfig } from "../../lib/stores"

	
	let zCurveConfig: ZCurveConfig = $curveConfig
	
	let config: RotatedShapeGeometryConfig = {
		zCurveConfig
	};

	let data = generateRotatedShapeGeometry(config);
	let levels = data.levels
	let bands = data.bands

	$: {
		config = {
			...config,
			zCurveConfig: $curveConfig,
		}
		data = generateRotatedShapeGeometry(config)
		levels = data.levels
		bands = data.bands
	}

	// const update = () => {
	// 	console.debug("updating", config.zCurveConfig.curves[0]);
	// 	config = {
	// 		...config,
	// 		zCurveConfig: {type: "ZCurveConfig", curves: [$curveConfig]}
	// 	}
	// 	const newData = generateRotatedShapeGeometry(config)
	// 	console.debug("regenerated \nold:", levels[9].vertices[0].x,"\nnew:", newData.levels[9].vertices[0].x)
	// 	levels = newData.levels
	// 	bands = newData.bands
	// 	console.debug("reassigned:", levels[9].vertices[0].x)
	// 	console.debug("new levels", levels, "new bands", bands)
	// }

</script>

<main>
	<section class="container three">
		<h2>3d</h2>
		<p>{levels[9].vertices[0].x}</p>
		<ThreeRenderer rslevels={levels} rsbands={bands} />
	</section>
	<section class="container svg">
		<h2>Cut Pattern</h2>
		<CutPattern rslevels={levels} rsbands={bands} />
	</section>
	<section class="container controls">
		<h2>Controls</h2>
		<!-- <button on:click={update}>Update</button> -->
		<PathEdit />
		<!-- <Controls {shadeConfig} {reactiveShadeConfig} shadeDispatch={dispatch}/> -->
	</section>
</main>

<style>
	main {
		height: 100vh;
		width: 100%;

		display: grid;
		grid-template-rows: 1fr 1fr;
		grid-template-columns: 1fr 1fr;
	}
	section.container {
		height: 100%;
		width: 100%;
		border: 1px solid gray;
	}
	section.container.three {
		grid-column: 1 / 2;
		grid-row: 1 / 3;
	}
	section.container.controls {
		grid-column: 2 / 3;
		grid-row: 1 / 2;
	}
	section.container.svg {
		grid-column: 2/ 3;
		grid-row: 2 / 3;
	}
</style>
