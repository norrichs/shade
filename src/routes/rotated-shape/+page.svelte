<script lang="ts">
	import ThreeRenderer from '../../components/three-renderer/ThreeRenderer.svelte';
	import CutPattern from '../../components/cut-pattern/CutPattern.svelte';
	import type { Writable } from 'svelte/store';
	import { generateRotatedShapeGeometry, type DepthCurveConfig } from '$lib/rotated-shape';
	import type {
		ShadesConfig,
		ZCurveConfig,
		LevelConfig,
		ShapeConfig,
		BandConfig,
		StrutConfig,
		Level,
		Strut
	} from '$lib/rotated-shape';
	import PathEdit from '../../components/path-edit/PathEdit.svelte';
	import { config0, config } from '$lib/stores';
	import Controls from '../../components/controls/Controls.svelte';
	import SelectBar from '../../components/select-bar/SelectBar.svelte';
	import SaveControl from '../../components/save-control/SaveControl.svelte';

	let data = generateRotatedShapeGeometry($config);
	let levels = data.levels;
	let displayLevels: Level[];
	let struts: Strut[];
	let bands = data.bands;
	let showControl: { name: string; value: unknown };

	const updateGeometry = () => {
		data = generateRotatedShapeGeometry($config);
	};

	$: {
		console.log('page reactive - generate');
		data = generateRotatedShapeGeometry($config);
		levels = data.levels;
		if ($config.renderConfig.ranges?.rangeStyle === 'slice') {
			const { levelStart, levelCount } = $config.renderConfig.ranges;
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
	type ShowControlCurveValue = 'ShapeConfig' | 'DepthCurveConfig' | 'ZCurveConfig';
	const isShowControlCurveValue = (value: unknown): value is ShowControlCurveValue => {
		return ['ShapeConfig', 'DepthCurveConfig', 'ZCurveConfig'].includes(value as string);
	};
</script>

<main>
	<section class="container three">
		<ThreeRenderer {levels} {bands} {struts} />
	</section>
	<section class="container svg">
		<CutPattern levels={displayLevels} {bands} {struts} />
	</section>
	<section class="container controls">
		<header>
			<SelectBar
				bind:value={showControl}
				options={[
					{ name: 'None' },
					{ name: 'Zcurve', value: 'ZCurveConfig' },
					{ name: 'DepthCurve', value: 'DepthCurveConfig' },
					{ name: 'Shape', value: 'ShapeConfig' },
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
				{#if ['Zcurve', 'Shape', 'DepthCurve'].includes(showControl?.name)}
					<PathEdit
						curveStoreType={isShowControlCurveValue(showControl.value)
							? showControl.value
							: 'ZCurveConfig'}
					/>
				{/if}
			</div>
			<Controls showControl={showControl?.name} />
			<SaveControl show={showControl?.name === 'Save'} config={$config} update={updateGeometry} />
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
