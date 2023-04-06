<script lang="ts">
	import ThreeRenderer from '../../components/three-renderer/ThreeRenderer.svelte';
	import CutPattern from '../../components/cut-pattern/CutPattern.svelte';
	import { generateRotatedShapeGeometry, generateZCurve, type LevelSetConfig } from '../../lib/rotated-shape';
	import type { RotatedShapeGeometryConfig, ZCurveConfig, BandSetConfig } from '../../lib/rotated-shape';
	import PathEdit from '../../components/path-edit/PathEdit.svelte';
	import { curveConfig, levelConfig, bandConfig } from "../../lib/stores"
	import Controls from '../../components/controls/Controls.svelte';

	
	let defaultZCurveConfig: ZCurveConfig = $curveConfig
	let defaultLevelConfig: LevelSetConfig = {...$levelConfig}
	let defaultBandConfig: BandSetConfig = $bandConfig
	
	let config: RotatedShapeGeometryConfig = {
		levelConfig: defaultLevelConfig,
		zCurveConfig: defaultZCurveConfig,
		bandConfig: defaultBandConfig,
	};

	let data = generateRotatedShapeGeometry(config);
	let levels = data.levels
	let bands = data.bands

	$: {
		config = {
			...config,
			levelConfig: {...$levelConfig},
			zCurveConfig: $curveConfig,
			bandConfig: $bandConfig
		}
		console.debug(" PAGE CONFIG", config)
		data = generateRotatedShapeGeometry(config)
		levels = data.levels
		bands = data.bands
	}

</script>

<main>
	<section class="container three">
		<h2>3d</h2>
		<!-- <p>{levels[9].vertices[0].x}</p> -->
		<ThreeRenderer rslevels={levels} rsbands={bands} />
	</section>
	<section class="container svg">
		<h2>Cut Pattern</h2>
		<CutPattern rslevels={levels} rsbands={bands} />
	</section>
	<section class="container controls">
		<header>
			<h2>Controls</h2>
		</header>
		<div class="group">
			<PathEdit />
			<Controls />
		</div>
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
		display: flex;
		flex-direction: column;
	}
	.container.controls .group {
		display: flex;
		flex-direction: row;
		justify-content: flex-start;
	}

	section.container.svg {
		grid-column: 2/ 3;
		grid-row: 2 / 3;
	}
</style>
