<script lang="ts">
	import ThreeRenderer from '../../components/three-renderer/ThreeRenderer.svelte';
	import CutPattern from '../../components/cut-pattern/CutPattern.svelte';
	import type { Writable } from 'svelte/store';
	import { generateRotatedShapeGeometry, type DepthCurveConfig } from '../../lib/rotated-shape';
	import type {
		RotatedShapeGeometryConfig,
		ZCurveConfig,
		LevelSetConfig,
		RadialShapeConfig,
		BandSetConfig,
		StrutConfig,
		RotatedShapeLevel,
		Strut
	} from '../../lib/rotated-shape';
	import PathEdit from '../../components/path-edit/PathEdit.svelte';
	import {
		strutConfig,
		curveConfig,
		depthCurveConfig,
		radialShapeConfig,
		levelConfig,
		bandConfig,
		renderConfig
	} from '../../lib/stores';
	import Controls from '../../components/controls/Controls.svelte';
	import SelectBar from '../../components/select-bar/SelectBar.svelte';
	import SaveControl from '../../components/save-control/SaveControl.svelte';

	let defaultZCurveConfig: ZCurveConfig = $curveConfig;
	let defaultLevelConfig: LevelSetConfig = { ...$levelConfig };
	let defaultBandConfig: BandSetConfig = $bandConfig;
	let defaultStrutConfig: StrutConfig = $strutConfig;

	let config: RotatedShapeGeometryConfig = {
		shapeConfig: $radialShapeConfig,
		depthCurveConfig: $depthCurveConfig,
		levelConfig: defaultLevelConfig,
		zCurveConfig: defaultZCurveConfig,
		bandConfig: defaultBandConfig,
		strutConfig: defaultStrutConfig,
		renderConfig: $renderConfig
	};

	let data = generateRotatedShapeGeometry(config);
	let levels = data.levels;
	let displayLevels: RotatedShapeLevel[];
	let struts: Strut[];
	let bands = data.bands;
	let showControl: { name: string; value: unknown };

	const updateGeometry = () => {
		config = {
			...config,
			shapeConfig: $radialShapeConfig,
			levelConfig: { ...$levelConfig },
			zCurveConfig: $curveConfig,
			depthCurveConfig: $depthCurveConfig,
			bandConfig: $bandConfig,
			strutConfig: $strutConfig
		};

		console.debug('udpateGeometry', config.shapeConfig);
		data = generateRotatedShapeGeometry(config);
	};

	$: {
		config = {
			...config,
			shapeConfig: $radialShapeConfig,
			levelConfig: { ...$levelConfig },
			zCurveConfig: $curveConfig,
			depthCurveConfig: $depthCurveConfig,
			bandConfig: $bandConfig,
			strutConfig: $strutConfig
		};
		// console.debug(' PAGE CONFIG', config);
		data = generateRotatedShapeGeometry(config);
		levels = data.levels;
		if ($renderConfig.ranges?.rangeStyle === 'slice') {
			const { levelStart, levelCount } = $renderConfig.ranges;
			displayLevels = levels.slice(
				levelStart || 0,
				levelCount ? (levelStart || 0) + levelCount : undefined
			);
		} else {
			displayLevels = levels;
		}
		bands = data.bands;
		struts = data.struts;
	}
	type ShowControlCurveValue =
		| { type: 'RadialShapeConfig'; configStore: Writable<RadialShapeConfig> }
		| { type: 'DepthCurveConfig'; configStore: Writable<DepthCurveConfig> }
		| { type: 'ZCurveConfig'; configStore: Writable<ZCurveConfig> }

	const isShowControlCurveValue = (value: ShowControlCurveValue | unknown): value is ShowControlCurveValue => {
		return !!value && typeof value === "object" && Object.hasOwn(value, "type")
	}
	
	const getPathEditCurve = (showControlValue: ShowControlCurveValue | unknown) => {
		if (isShowControlCurveValue(showControlValue)) {
			return showControlValue.configStore
		}
		return undefined;
	}
</script>

<main>
	<section class="container three">
		<ThreeRenderer rslevels={levels} rsbands={bands} {struts} />
	</section>
	<section class="container svg">
		<CutPattern rslevels={displayLevels} rsbands={bands} {struts} />
	</section>
	<section class="container controls">
		<header>
			<SelectBar
				bind:value={showControl}
				options={[
					{ name: 'None' },
					{ name: 'Zcurve', value: { type: 'ZCurveConfig', configStore: curveConfig } },
					{
						name: 'DepthCurve',
						value: { type: 'DepthCurveConfig', configStore: depthCurveConfig }
					},
					{ name: 'Shape', value: { type: 'RadialShapeConfig', configStore: radialShapeConfig } },
					{ name: '3D' },
					{ name: 'Levels' },
					{ name: 'Struts' },
					{ name: 'Cut' },
					{ name: 'Save' }
				]}
			/>
		</header>
		<div class="group">
			<div>
				<!-- <div>{showControl?.name}</div> -->
				{#if ["Zcurve", "Shape", "DepthCurve"].includes(showControl?.name)}
					<PathEdit curveStore={getPathEditCurve(showControl.value)} />
				{/if}
			</div>
			<Controls showControl={showControl?.name} />
			<SaveControl show={showControl?.name === 'Save'} {config} update={updateGeometry} />
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
