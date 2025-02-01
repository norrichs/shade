<script lang="ts">
	import CombinedNumberInput from './CombinedNumberInput.svelte';
	import SelectInput from './SelectInput.svelte';
	import { patternConfigStore } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import PatternTileButton from '../pattern/PatternTileButton.svelte';
	import CheckboxInput from './CheckboxInput.svelte';
	import NumberInput from './super-control/NumberInput.svelte';

	let fitToPage = false;

	const fitPatternToPage = (fitToPage: boolean) => {
		if (!fitToPage && $patternConfigStore.patternConfig.pixelScale.value !== 1) {
			$patternConfigStore.patternConfig.pixelScale.value = 1;
			return;
		}
		// if ($bandPattern.meta?.maxLength && $bandPattern.projectionType === 'patterned') {
		// 	// const { maxLength } = $bandPattern.meta;
		// 	const { page, pixelScale } = $patternConfigStore.patternConfig;
		// 	const marginByPageHeight = 0.05;
		// 	const scaleFactor = (page.height - page.height * marginByPageHeight) / maxLength;

		// 	$patternConfigStore.patternConfig.pixelScale = {
		// 		...pixelScale,
		// 		value: pixelScale.value * scaleFactor
		// 	};
		// }
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
			{#if $patternConfigStore.tiledPatternConfig.config.rowCount && $patternConfigStore.tiledPatternConfig.config.columnCount}
				<CombinedNumberInput
					label="Rows"
					bind:value={$patternConfigStore.tiledPatternConfig.config.rowCount}
					min={1}
					max={5}
					step={1}
				/>
				<CombinedNumberInput
					label="Columns"
					bind:value={$patternConfigStore.tiledPatternConfig.config.columnCount}
					min={1}
					max={5}
					step={1}
				/>
			{/if}
			<SelectInput
				label="Dynamic Stroke"
				bind:value={$patternConfigStore.tiledPatternConfig.config.dynamicStroke}
				options={['quadWidth', 'quadHeight']}
			/>
			<CombinedNumberInput
				label="Stroke minimum"
				bind:value={$patternConfigStore.tiledPatternConfig.config.dynamicStrokeMin}
				min={0.1}
				max={Math.min($patternConfigStore.tiledPatternConfig.config.dynamicStrokeMax, 20)}
				step={0.1}
			/>
			<CombinedNumberInput
				label="Stroke maximum"
				bind:value={$patternConfigStore.tiledPatternConfig.config.dynamicStrokeMax}
				min={Math.max($patternConfigStore.tiledPatternConfig.config.dynamicStrokeMin, 0.1)}
				max={20}
				step={0.1}
			/>
			<CheckboxInput label="Match End Segments" bind:value={$patternConfigStore.tiledPatternConfig.config.endsMatched}/>
			<CheckboxInput label="Remove End Segments" bind:value={$patternConfigStore.tiledPatternConfig.config.endsTrimmed}/>
			<NumberInput label="Loop Ends" bind:value={$patternConfigStore.tiledPatternConfig.config.endLooped}/>
			<div>
				<div>
					<span>Model Height:</span>
					<!-- <span>{Math.round($globuleStore.height * 10) / 10}</span> -->
				</div>
				<div>
					<span>Pattern Length:</span>
					<!-- <span>{$bandPattern.meta?.maxLength ? Math.round($bandPattern.meta?.maxLength) : 0}</span> -->
				</div>
				<div>
					<span>Page:</span>
					<span
						>{`${$patternConfigStore.patternConfig.page.height} x ${$patternConfigStore.patternConfig.page.width} ${$patternConfigStore.patternConfig.page.unit}`}</span
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
