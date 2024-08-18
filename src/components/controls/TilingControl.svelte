<script lang="ts">
	import CombinedNumberInput from './CombinedNumberInput.svelte';
	import SelectInput from './SelectInput.svelte';
	import { bandPattern, config0, shapeData } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import PatternTileButton from '../pattern/PatternTileButton.svelte';
	import CheckboxInput from './CheckboxInput.svelte';
	import type { PatternedPattern } from '$lib/types';
	import { generateTiledBandPattern } from '$lib/cut-pattern/cut-pattern';
	import { ContextBridge } from '@threlte/core';

	let fitToPage = false;

	const fitPatternToPage = (fitToPage: boolean) => {
		if (!fitToPage && $config0.patternConfig.pixelScale.value !== 1) {
			$config0.patternConfig.pixelScale.value = 1;
			return;
		}
		if ($bandPattern.meta?.maxLength && $bandPattern.projectionType === 'patterned') {
			const { maxLength } = $bandPattern.meta;
			const { page, pixelScale } = $config0.patternConfig;
			const marginByPageHeight = 0.05;
			const scaleFactor = (page.height - page.height * marginByPageHeight) / maxLength;
			console.debug(
				'fitPatternToPage',
				maxLength,
				pixelScale.value,
				pixelScale.unit,
				page.height,
				page.width,
				page.unit,
				scaleFactor
			);

			$config0.patternConfig.pixelScale = {
				...pixelScale,
				value: pixelScale.value * scaleFactor
			};
		}
	};

	$: {
		fitPatternToPage(fitToPage);
	}
</script>

<section>
	<h4>Tiling</h4>
	<ControlGroup>
		<div class="option-tile-group">
			{#each Object.values(tiledPatternConfigs).filter((config) => config.tiling === 'quadrilateral') as config}
				<PatternTileButton patternType={config.type} tilingBasis="quadrilateral" />
			{/each}
		</div>
		<div class="option-tile-group">
			{#each Object.values(tiledPatternConfigs).filter((config) => config.tiling === 'band') as config}
				<PatternTileButton patternType={config.type} tilingBasis="band" />
			{/each}
		</div>
	</ControlGroup>
	<ControlGroup>
		<div>
			{#if $config0.tiledPatternConfig.config.rowCount && $config0.tiledPatternConfig.config.columnCount}
				<CombinedNumberInput
					label="Rows"
					bind:value={$config0.tiledPatternConfig.config.rowCount}
					min={1}
					max={5}
					step={1}
				/>
				<CombinedNumberInput
					label="Columns"
					bind:value={$config0.tiledPatternConfig.config.columnCount}
					min={1}
					max={5}
					step={1}
				/>
			{/if}
			<SelectInput
				label="Dynamic Stroke"
				bind:value={$config0.tiledPatternConfig.config.dynamicStroke}
				options={['quadWidth', 'quadHeight']}
			/>
			<CombinedNumberInput
				label="Stroke minimum"
				bind:value={$config0.tiledPatternConfig.config.dynamicStrokeMin}
				min={0.1}
				max={Math.min($config0.tiledPatternConfig.config.dynamicStrokeMax, 20)}
				step={0.1}
			/>
			<CombinedNumberInput
				label="Stroke maximum"
				bind:value={$config0.tiledPatternConfig.config.dynamicStrokeMax}
				min={Math.max($config0.tiledPatternConfig.config.dynamicStrokeMin, 0.1)}
				max={20}
				step={0.1}
			/>
			<div>
				<div>
					<span>Model Height:</span>
					<span>{Math.round($shapeData.height * 10) / 10}</span>
				</div>
				<div>
					<span>Pattern Length:</span>
					<span>{$bandPattern.meta?.maxLength ? Math.round($bandPattern.meta?.maxLength) : 0}</span>
				</div>
				<div>
					<span>Page:</span>
					<span
						>{`${$config0.patternConfig.page.height} x ${$config0.patternConfig.page.width} ${$config0.patternConfig.page.unit}`}</span
					>
				</div>
			</div>
			<CheckboxInput label="Fit to page" bind:value={fitToPage} />
		</div>
	</ControlGroup>
</section>

<style>
	.option-tile-group {
		display: flex;
		flex-direction: row;
	}
</style>
