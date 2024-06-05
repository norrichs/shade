<script lang="ts">
	import CombinedNumberInput from './CombinedNumberInput.svelte';
	import CheckboxInput from './CheckboxInput.svelte';
	import SelectInput from './SelectInput.svelte';
	import { config0 } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import type { TiledPatternConfig } from '$lib/types';

	const getTilingOptions = (configs: { [key: string]: TiledPatternConfig }) => {
		console.debug('getTilingOptions', Object.values(configs));
		return Object.values(configs).map((cfg) => {
			return Object.fromEntries([[cfg.type, cfg]]);
		});
	};
</script>

<section>
	<h4>Tiling</h4>
	<ControlGroup>
		<SelectInput
			label="Tiling Pattern"
			bind:value={$config0.tiledPatternConfig}
			options={getTilingOptions(tiledPatternConfigs)}
		/>
	</ControlGroup>
	<ControlGroup>
		<div><span>Type: </span><span>{$config0.tiledPatternConfig.type}</span></div>
		<div>
			{#if Array.isArray($config0.tiledPatternConfig.config)}
				{#each $config0.tiledPatternConfig.config as cfg, i}
					{#if cfg.valueType === 'number'}
						<CombinedNumberInput
							label={cfg.type}
							bind:value={cfg.value}
							min={cfg.min}
							max={cfg.max}
							step={cfg.step}
						/>
					{:else if cfg.valueType === 'boolean'}
						<CheckboxInput label={cfg.type} bind:value={cfg.value} />
					{:else if cfg.valueType === 'named'}
						<SelectInput label={cfg.type} bind:value={cfg.value} options={cfg.options} />
					{/if}
				{/each}
			{:else if $config0.tiledPatternConfig.type === 'tiledHexPattern-1'}
				<CheckboxInput
					label="AdjustBandBoundary"
					bind:value={$config0.tiledPatternConfig.config.adjustBandBoundary.value}
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
			{:else if $config0.tiledPatternConfig.type === 'tiledBowtiePattern-0'}
				<CombinedNumberInput
					label="Rows"
					bind:value={$config0.tiledPatternConfig.config.rowCount}
					min={$config0.tiledPatternConfig.config.rowCount.min}
					max={$config0.tiledPatternConfig.config.rowCount.max}
					step={$config0.tiledPatternConfig.config.rowCount.step}
				/>
				<CombinedNumberInput
					label="Columns"
					bind:value={$config0.tiledPatternConfig.config.columnCount}
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
			{/if}
		</div>
	</ControlGroup>
</section>

<style>
</style>
