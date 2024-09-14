<script lang="ts">
	import CombinedNumberInput from './CombinedNumberInput.svelte';
	import SelectInput from './SelectInput.svelte';
	import { bandPattern, configStore0, globuleStore } from '$lib/stores/stores';
	import ControlGroup from './ControlGroup.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import PatternTileButton from '../pattern/PatternTileButton.svelte';
	import CheckboxInput from './CheckboxInput.svelte';

	let fitToPage = false;

	const fitPatternToPage = (fitToPage: boolean) => {
		if (!fitToPage && $configStore0.patternConfig.pixelScale.value !== 1) {
			$configStore0.patternConfig.pixelScale.value = 1;
			return;
		}
		if ($bandPattern.meta?.maxLength && $bandPattern.projectionType === 'patterned') {
			const { maxLength } = $bandPattern.meta;
			const { page, pixelScale } = $configStore0.patternConfig;
			const marginByPageHeight = 0.05;
			const scaleFactor = (page.height - page.height * marginByPageHeight) / maxLength;

			$configStore0.patternConfig.pixelScale = {
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
			{#if $configStore0.tiledPatternConfig.config.rowCount && $configStore0.tiledPatternConfig.config.columnCount}
				<CombinedNumberInput
					label="Rows"
					bind:value={$configStore0.tiledPatternConfig.config.rowCount}
					min={1}
					max={5}
					step={1}
				/>
				<CombinedNumberInput
					label="Columns"
					bind:value={$configStore0.tiledPatternConfig.config.columnCount}
					min={1}
					max={5}
					step={1}
				/>
			{/if}
			<SelectInput
				label="Dynamic Stroke"
				bind:value={$configStore0.tiledPatternConfig.config.dynamicStroke}
				options={['quadWidth', 'quadHeight']}
			/>
			<CombinedNumberInput
				label="Stroke minimum"
				bind:value={$configStore0.tiledPatternConfig.config.dynamicStrokeMin}
				min={0.1}
				max={Math.min($configStore0.tiledPatternConfig.config.dynamicStrokeMax, 20)}
				step={0.1}
			/>
			<CombinedNumberInput
				label="Stroke maximum"
				bind:value={$configStore0.tiledPatternConfig.config.dynamicStrokeMax}
				min={Math.max($configStore0.tiledPatternConfig.config.dynamicStrokeMin, 0.1)}
				max={20}
				step={0.1}
			/>
			<div>
				<div>
					<span>Model Height:</span>
					<span>{Math.round($globuleStore.height * 10) / 10}</span>
				</div>
				<div>
					<span>Pattern Length:</span>
					<span>{$bandPattern.meta?.maxLength ? Math.round($bandPattern.meta?.maxLength) : 0}</span>
				</div>
				<div>
					<span>Page:</span>
					<span
						>{`${$configStore0.patternConfig.page.height} x ${$configStore0.patternConfig.page.width} ${$configStore0.patternConfig.page.unit}`}</span
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
