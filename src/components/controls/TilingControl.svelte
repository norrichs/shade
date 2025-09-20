<script lang="ts">
	import CombinedNumberInput from './CombinedNumberInput.svelte';
	import SelectInput from './SelectInput.svelte';
	import { patternConfigStore } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import PatternTileButton from '../pattern/PatternTileButton.svelte';
	import CheckboxInput from './CheckboxInput.svelte';
	import NumberInput from './super-control/NumberInput.svelte';
	import type { GridVariant, TiledPatternConfig } from '$lib/types';

	let fitToPage = false;

	const handleVariantChange = (e: Event) => {
		const target = e.target;
		if (target instanceof HTMLSelectElement) {
			$patternConfigStore.tiledPatternConfig.config.variant = (target.value ||
				'rect') as GridVariant;
			console.debug(
				'TilingControl',
				target?.value,
				$patternConfigStore.tiledPatternConfig.config.variant
			);
		}
	};

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
	const getTiles = (configs: { [key: string]: TiledPatternConfig }) => {
		return ['quadrilateral', 'triangle', 'band']
			.map((tilingBasis) => {
				return Object.values(configs).filter((config) => config.tiling === tilingBasis);
			})
			.flat();
	};

	$: {
		fitPatternToPage(fitToPage);
	}
	console.debug('tiled pattern config', $patternConfigStore.tiledPatternConfig.config);
</script>

<section>
	<section class="tiles">
		<div class="option-tile-group">
			{#each getTiles(tiledPatternConfigs) as config}
				<PatternTileButton size={45} patternType={config.type} tilingBasis={config.tiling} />
			{/each}
		</div>
	</section>

	<ControlGroup>
		<div>
			{#if $patternConfigStore.tiledPatternConfig.config.variant}
				<select
					on:change={handleVariantChange}
					bind:value={$patternConfigStore.tiledPatternConfig.config.variant}
				>
					{#each ['rect', 'triangle-0', 'triangle-1'] as option}
						<option>{option}</option>
					{/each}
				</select>
			{/if}
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
			{#if $patternConfigStore.tiledPatternConfig.config.skipEdges}
				<SelectInput
					label="Skip Edges"
					bind:value={$patternConfigStore.tiledPatternConfig.config.skipEdges}
					options={['all', 'none', 'not-first', 'not-last', 'not-both']}
				/>
			{/if}
			<CheckboxInput
				label="Match End Segments"
				bind:value={$patternConfigStore.tiledPatternConfig.config.endsMatched}
			/>
			<CheckboxInput
				label="Remove End Segments"
				bind:value={$patternConfigStore.tiledPatternConfig.config.endsTrimmed}
			/>
			<NumberInput
				label="Loop Ends"
				bind:value={$patternConfigStore.tiledPatternConfig.config.endLooped}
			/>
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
	.tiles {
		display: flex;
		flex-direction: column;
		width: var(--secondary-width);
	}
	.option-tile-group {
		display: flex;
		flex-direction: row;
		gap: 4px;
		width: calc(var(--secondary-width) - 16px);
		overflow: auto;
		padding: 4px;
	}
</style>
