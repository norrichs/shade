<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import { isClose } from '$lib/util';
	import NumberInput from '../controls/super-control/NumberInput.svelte';
	import PanControl from './PanControl.svelte';

	let labelScale = 0.1;
	let labelAngle = 0;

	const updateStore = (scale?: number, angle?: number) => {
		if (!$patternConfigStore.tiledPatternConfig.labels) {
			$patternConfigStore.tiledPatternConfig.labels = { scale: labelScale, angle: labelAngle };
			return;
		}
		const newLabelParams: { scale: number; angle: number } = {
			scale: 0.1,
			angle: 0
		};
		if (!isClose(scale, $patternConfigStore.tiledPatternConfig.labels.scale)) {
			newLabelParams.scale = labelScale;
		}
		if (!isClose(angle, $patternConfigStore.tiledPatternConfig.labels.angle)) {
			newLabelParams.angle = labelAngle;
		}
		$patternConfigStore.tiledPatternConfig.labels = newLabelParams;
	};
	$: updateStore(labelScale, labelAngle);
</script>

<div class="view-control-box">
	<div class="row">
		<PanControl />
		<div>
			<span>Zoom</span>
			<NumberInput
				min={-2}
				max={2}
				step={0.1}
				hasButtons
				bind:value={$patternConfigStore.patternViewConfig.zoom}
			/>
		</div>
		<div>
			<span>Label</span>
			<NumberInput min={-2} max={2} step={0.1} hasButtons bind:value={labelScale} />
			<NumberInput min={-180} max={180} step={1} hasButtons bind:value={labelAngle} />
		</div>
	</div>
	<label for="svg-width">width</label>
	<input
		id="svg-width"
		type="number"
		bind:value={$patternConfigStore.patternViewConfig.width}
		class="view-control"
	/>
	<label for="svg-height">height</label>
	<input
		id="svg-height"
		type="number"
		bind:value={$patternConfigStore.patternViewConfig.height}
		class="view-control"
	/>

	<label for="svg-page-width">page width</label>
	<input
		id="svg-page-width"
		type="number"
		bind:value={$patternConfigStore.patternConfig.page.width}
		class="view-control"
		step={10}
	/>
	<label for="svg-page-width">page height</label>
	<input
		id="svg-page-height"
		type="number"
		bind:value={$patternConfigStore.patternConfig.page.height}
		class="view-control"
		step={10}
	/>
	<label for="svg-page-unit">page unit</label>
	<select
		id="svg-page-unit"
		bind:value={$patternConfigStore.patternConfig.page.unit}
		class="view-control"
	>
		<option>mm</option>
		<option>cm</option>
		<option>in</option>
	</select>
</div>

<style>
	.view-control-box {
		position: absolute;
		top: 20px;
		left: 20px;
		background-color: rgba(200, 200, 200, 0.9);
		padding: 8px;
		border-radius: 3px;
		font-family: 'Open Sans', sans-serif;
		font-optical-sizing: auto;
		font-weight: 300;
		font-style: normal;
		font-variation-settings: 100;
		font-size: 1rem;
	}
	.view-control-box > .row {
		display: flex;
		flex-direction: row;
		justify-content: flex-start;
		gap: 12px;
	}
	.view-control {
		width: 50px;
	}
</style>
