<script lang="ts">
	import type { ProjectionRange } from '$lib/projection-geometry/filters';
	import { patternConfigStore } from '$lib/stores';
	import { isClose } from '$lib/util';
	import CheckboxInput from '../controls/CheckboxInput.svelte';
	import NumberInput from '../controls/super-control/NumberInput.svelte';
	import Button from '../design-system/Button.svelte';
	import PanControl from './PanControl.svelte';

	let labelScale = 0.1;
	let labelAngle = $patternConfigStore.tiledPatternConfig.labels?.angle ?? 0;

	let rangeTubes: ProjectionRange['tubes'] = $patternConfigStore.patternViewConfig.range?.tubes;
	let rangeBands: ProjectionRange['bands'] = $patternConfigStore.patternViewConfig.range?.bands;
	let rangeFacets: ProjectionRange['facets'] = $patternConfigStore.patternViewConfig.range?.facets;

	const updateStore = (
		scale?: number,
		angle?: number,
		rangeTubes?: ProjectionRange['tubes'] | undefined,
		rangeBands?: ProjectionRange['bands'] | undefined,
		rangeFacets?: ProjectionRange['facets'] | undefined
	) => {
		$patternConfigStore.patternViewConfig.range = {
			tubes: rangeTubes,
			bands: rangeBands,
			facets: rangeFacets
		};

		if (!$patternConfigStore.tiledPatternConfig.labels) {
			$patternConfigStore.tiledPatternConfig.labels = { scale: labelScale, angle: labelAngle };
			return;
		}
		const newLabelParams: { scale: number; angle: number } = {
			scale: 0.1,
			angle: Math.PI
		};
		if (!isClose(scale, $patternConfigStore.tiledPatternConfig.labels.scale)) {
			newLabelParams.scale = labelScale;
		}
		if (!isClose(angle, $patternConfigStore.tiledPatternConfig.labels.angle)) {
			newLabelParams.angle = labelAngle;
		}
		$patternConfigStore.tiledPatternConfig.labels = newLabelParams;
	};
	$: updateStore(labelScale, labelAngle, rangeTubes, rangeBands, rangeFacets);
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
		<div>
			<CheckboxInput
				label="show Quadrilaterals"
				bind:value={$patternConfigStore.patternViewConfig.showQuads}
			/>
			<CheckboxInput
				label="show Labels"
				bind:value={$patternConfigStore.patternViewConfig.showLabels}
			/>
		</div>
		<div>
			<div>
				<span>Range</span>
				<div class="range-inputs">
					{#if Array.isArray(rangeTubes) && rangeTubes.length == 2}
						<NumberInput label="tubes" min={0} max={1} step={1} bind:value={rangeTubes[0]} />
						<NumberInput min={0} max={1} step={1} bind:value={rangeTubes[1]} />
					{:else}
						<button on:click={() => (rangeTubes = [0, 1])}>SetTubes</button>
					{/if}
				</div>
				<div class="range-inputs">
					{#if Array.isArray(rangeBands) && rangeBands.length == 2}
						<NumberInput label="bands" min={0} max={1} step={1} bind:value={rangeBands[0]} />
						<NumberInput min={0} max={1} step={1} bind:value={rangeBands[1]} />
					{:else}
						<button on:click={() => (rangeBands = [0, 1])}>SetBands</button>
					{/if}
				</div>
				<div class="range-inputs">
					{#if Array.isArray(rangeFacets) && rangeFacets.length == 2}
						<NumberInput label="facets" min={0} max={1} step={1} bind:value={rangeFacets[0]} />
						<NumberInput min={0} max={1} step={1} bind:value={rangeFacets[1]} />
					{:else}
						<button on:click={() => (rangeFacets = [0, 1])}>SetFacets</button>
					{/if}
				</div>
			</div>
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
	.range-inputs {
		display: flex;
		flex-direction: row;
		gap: 0px;
	}
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
