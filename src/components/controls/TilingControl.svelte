<script lang="ts">
	import CombinedNumberInput from './CombinedNumberInput.svelte';
	import SelectInput from './SelectInput.svelte';
	import { patternConfigStore } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';
	import { tiledPatternConfigs, defaultOutlinedPatternConfig } from '$lib/shades-config';
	import PatternTileButton from '../pattern/PatternTileButton.svelte';
	import CheckboxInput from './CheckboxInput.svelte';
	import NumberInput from './super-control/NumberInput.svelte';
	import type { GridVariant, TiledPatternConfig, TabShape, TabEdgeOption } from '$lib/types';
	import { isTiledPatternConfig, isOutlinedPatternConfig } from '$lib/types';

	let fitToPage = false;

	$: isOutlined = isOutlinedPatternConfig($patternConfigStore.patternTypeConfig);
	$: isTiled = isTiledPatternConfig($patternConfigStore.patternTypeConfig);

	const switchToOutlined = () => {
		$patternConfigStore.patternTypeConfig = defaultOutlinedPatternConfig();
	};

	const switchToTiled = () => {
		$patternConfigStore.patternTypeConfig = tiledPatternConfigs['tiledShieldTesselationPattern'];
	};

	const handleVariantChange = (e: Event) => {
		const target = e.target;
		if (target instanceof HTMLSelectElement) {
			$patternConfigStore.patternTypeConfig.config.variant = (target.value ||
				'rect') as GridVariant;
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
</script>

<section>
	<ControlGroup>
		<div>
			<button on:click={switchToTiled} class:active={isTiled}>Tiled</button>
			<button on:click={switchToOutlined} class:active={isOutlined}>Outlined</button>
		</div>
	</ControlGroup>

	{#if isOutlined && isOutlinedPatternConfig($patternConfigStore.patternTypeConfig)}
		<ControlGroup>
			<div>
				<div>
					<span>Enable Tabs</span>
					<input
						type="checkbox"
						checked={!!$patternConfigStore.patternTypeConfig.tabConfig}
						on:change={(e) => {
							if (e.target.checked) {
								$patternConfigStore.patternTypeConfig = {
									...$patternConfigStore.patternTypeConfig,
									tabConfig: { bandEdge: 'before', shape: 'rectangle', tabWidth: 5 }
								};
							} else {
								$patternConfigStore.patternTypeConfig = {
									...$patternConfigStore.patternTypeConfig,
									tabConfig: undefined
								};
							}
						}}
					/>
				</div>
				{#if $patternConfigStore.patternTypeConfig.tabConfig}
					<SelectInput
						label="Tab Shape"
						bind:value={$patternConfigStore.patternTypeConfig.tabConfig.shape}
						options={['rectangle', 'rounded', 'inset', 'partner', 'partner-inset']}
					/>
					<NumberInput
						label="Tab Width"
						bind:value={$patternConfigStore.patternTypeConfig.tabConfig.tabWidth}
					/>
					{#if $patternConfigStore.patternTypeConfig.tabConfig.shape === 'inset' || $patternConfigStore.patternTypeConfig.tabConfig.shape === 'partner-inset'}
						<NumberInput
							label="Inset"
							bind:value={$patternConfigStore.patternTypeConfig.tabConfig.inset}
						/>
					{/if}
					<div class="row">
						<span>Band Edge Tabs</span>
						<select
							value={$patternConfigStore.patternTypeConfig.tabConfig.bandEdge ?? 'none'}
							on:change={(e) => {
								const val = e.target.value;
								$patternConfigStore.patternTypeConfig.tabConfig.bandEdge = val === 'none' ? undefined : val;
								$patternConfigStore = $patternConfigStore;
							}}
						>
							<option value="none">none</option>
							<option value="before">before</option>
							<option value="after">after</option>
							<option value="beforeAndAfter">beforeAndAfter</option>
						</select>
					</div>
					<div class="row">
						<span>Band End Tabs</span>
						<select
							value={$patternConfigStore.patternTypeConfig.tabConfig.bandEnd ?? 'none'}
							on:change={(e) => {
								const val = e.target.value;
								$patternConfigStore.patternTypeConfig.tabConfig.bandEnd = val === 'none' ? undefined : val;
								$patternConfigStore = $patternConfigStore;
							}}
						>
							<option value="none">none</option>
							<option value="before">before</option>
							<option value="after">after</option>
							<option value="beforeAndAfter">beforeAndAfter</option>
						</select>
					</div>
				{/if}
			</div>
		</ControlGroup>
	{/if}

	{#if isTiled}
		<section class="tiles">
			<div class="option-tile-group">
				{#each getTiles(tiledPatternConfigs) as config}
					<PatternTileButton size={45} patternType={config.type} tilingBasis={config.tiling} />
				{/each}
			</div>
		</section>
	{/if}

	{#if isTiled}
	<ControlGroup>
		<div>
			{#if $patternConfigStore.patternTypeConfig.config.variant}
				<select
					on:change={handleVariantChange}
					bind:value={$patternConfigStore.patternTypeConfig.config.variant}
				>
					{#each ['rect', 'triangle-0', 'triangle-1'] as option}
						<option>{option}</option>
					{/each}
				</select>
			{/if}
			{#if $patternConfigStore.patternTypeConfig.config.rowCount && $patternConfigStore.patternTypeConfig.config.columnCount}
				<CombinedNumberInput
					label="Rows"
					bind:value={$patternConfigStore.patternTypeConfig.config.rowCount}
					min={1}
					max={5}
					step={1}
				/>
				<CombinedNumberInput
					label="Columns"
					bind:value={$patternConfigStore.patternTypeConfig.config.columnCount}
					min={1}
					max={5}
					step={1}
				/>
			{/if}
			<SelectInput
				label="Dynamic Stroke"
				bind:value={$patternConfigStore.patternTypeConfig.config.dynamicStroke}
				options={['quadWidth', 'quadHeight']}
			/>
			<CombinedNumberInput
				label="Stroke minimum"
				bind:value={$patternConfigStore.patternTypeConfig.config.dynamicStrokeMin}
				min={0.1}
				max={Math.min($patternConfigStore.patternTypeConfig.config.dynamicStrokeMax, 20)}
				step={0.1}
			/>
			<CombinedNumberInput
				label="Stroke maximum"
				bind:value={$patternConfigStore.patternTypeConfig.config.dynamicStrokeMax}
				min={Math.max($patternConfigStore.patternTypeConfig.config.dynamicStrokeMin, 0.1)}
				max={20}
				step={0.1}
			/>
			{#if $patternConfigStore.patternTypeConfig.config.skipEdges}
				<SelectInput
					label="Skip Edges"
					bind:value={$patternConfigStore.patternTypeConfig.config.skipEdges}
					options={['all', 'none', 'not-first', 'not-last', 'not-both']}
				/>
			{/if}
			<CheckboxInput
				label="Match End Segments"
				bind:value={$patternConfigStore.patternTypeConfig.config.endsMatched}
			/>
			<CheckboxInput
				label="Remove End Segments"
				bind:value={$patternConfigStore.patternTypeConfig.config.endsTrimmed}
			/>
			<NumberInput
				label="Loop Ends"
				bind:value={$patternConfigStore.patternTypeConfig.config.endLooped}
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
	{/if}
</section>

<style>
	.tiles {
		display: flex;
		flex-direction: column;
		width: var(--secondary-width);
	}
	button.active {
		font-weight: bold;
		text-decoration: underline;
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
