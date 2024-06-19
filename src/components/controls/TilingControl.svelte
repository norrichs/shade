<script lang="ts">
	import CombinedNumberInput from './CombinedNumberInput.svelte';
	import CheckboxInput from './CheckboxInput.svelte';
	import SelectInput from './SelectInput.svelte';
	import { config0 } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import type { TiledPatternConfig } from '$lib/types';
	import PatternTile from '../pattern/PatternTile.svelte';
	import { patterns } from '$lib/patterns/patterns';
	import PatterTileButton from '../pattern/PatterTileButton.svelte';

	const getTilingOptions = (configs: { [key: string]: TiledPatternConfig }) => {
		console.debug('getTilingOptions', Object.values(configs));
		return Object.values(configs).map((cfg) => {
			return Object.fromEntries([[cfg.type, cfg]]);
		});
	};

	let activeConfig = $config0.tiledPatternConfig;
</script>

<section>
	<h4>Tiling</h4>
	<ControlGroup>
		<div class="option-tile-group">
			{#each Object.keys(tiledPatternConfigs) as patternType}
				<PatterTileButton {patternType} />
			{/each}
		</div>
	</ControlGroup>
	<ControlGroup>
		<CombinedNumberInput
			label="Rows"
			bind:value={$config0.tiledPatternConfig.config.rowCount.value}
			min={$config0.tiledPatternConfig.config.rowCount.min}
			max={$config0.tiledPatternConfig.config.rowCount.max}
			step={$config0.tiledPatternConfig.config.rowCount.step}
		/>
		<CombinedNumberInput
			label="Columns"
			bind:value={$config0.tiledPatternConfig.config.columnCount.value}
			min={$config0.tiledPatternConfig.config.columnCount.min}
			max={$config0.tiledPatternConfig.config.columnCount.max}
			step={$config0.tiledPatternConfig.config.columnCount.step}
		/>
		<SelectInput
			label="Dynamic Stroke"
			bind:value={$config0.tiledPatternConfig.config.dynamicStroke.value}
			options={$config0.tiledPatternConfig.config.dynamicStroke.options}
		/>
		<CombinedNumberInput
			label="Stroke minimun"
			bind:value={$config0.tiledPatternConfig.config.dynamicStrokeMin.value}
			min={$config0.tiledPatternConfig.config.dynamicStrokeMin.min}
			max={$config0.tiledPatternConfig.config.dynamicStrokeMin.max}
			step={$config0.tiledPatternConfig.config.dynamicStrokeMin.step}
		/>
		<CombinedNumberInput
			label="Stroke maximum"
			bind:value={$config0.tiledPatternConfig.config.dynamicStrokeMax.value}
			min={$config0.tiledPatternConfig.config.dynamicStrokeMax.min}
			max={$config0.tiledPatternConfig.config.dynamicStrokeMax.max}
			step={$config0.tiledPatternConfig.config.dynamicStrokeMax.step}
		/>
	</ControlGroup>
</section>

<style>
	.option-tile-group {
		display: flex;
		flex-direction: row;
	}
</style>
