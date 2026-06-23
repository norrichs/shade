<script lang="ts">
	import type { ProjectionRange } from '$lib/projection-geometry/filters';
	import { patternConfigStore, superConfigStore } from '$lib/stores';
	import CheckboxInput from '../controls/CheckboxInput.svelte';
	import NumberInput from '../controls/super-control/NumberInput.svelte';
	import PanControl from './PanControl.svelte';
	import type { PatternLayoutMode } from '$lib/types';

	let rangeTubes: ProjectionRange['tubes'] = $patternConfigStore.patternViewConfig.range?.tubes;
	let rangeBands: ProjectionRange['bands'] = $patternConfigStore.patternViewConfig.range?.bands;
	let rangeFacets: ProjectionRange['facets'] = $patternConfigStore.patternViewConfig.range?.facets;

	const updateStore = (
		rangeTubes?: ProjectionRange['tubes'] | undefined,
		rangeBands?: ProjectionRange['bands'] | undefined,
		rangeFacets?: ProjectionRange['facets'] | undefined
	) => {
		$patternConfigStore.patternViewConfig.range = {
			tubes: rangeTubes,
			bands: rangeBands,
			facets: rangeFacets
		};
	};
	$: updateStore(rangeTubes, rangeBands, rangeFacets);

	$: {
		const pc = $superConfigStore.projectionConfigs[0];
		if (pc && !pc.surfaceProjectionConfig) {
			pc.surfaceProjectionConfig = { divisions: 0 };
		}
	}

	const MODE_ORDER: PatternLayoutMode[] = ['linear', 'line-wrap', 'page'];
	const MODE_LABEL: Record<PatternLayoutMode, string> = {
		linear: 'Linear',
		'line-wrap': 'Line-wrap',
		page: 'Page'
	};
	const cycleMode = () => {
		const cur = $patternConfigStore.patternViewConfig.patternLayoutMode ?? 'linear';
		const next = MODE_ORDER[(MODE_ORDER.indexOf(cur) + 1) % MODE_ORDER.length];
		$patternConfigStore.patternViewConfig.patternLayoutMode = next;
	};
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
			<CheckboxInput
				label="show Quadrilaterals"
				bind:value={$patternConfigStore.patternViewConfig.showQuads}
			/>
			<CheckboxInput
				label="show Labels"
				bind:value={$patternConfigStore.patternViewConfig.showLabels}
			/>
			<button class="mode-cycle" on:click={cycleMode}>
				Layout: {MODE_LABEL[$patternConfigStore.patternViewConfig.patternLayoutMode ?? 'linear']}
			</button>
			{#if $patternConfigStore.patternViewConfig.patternLayoutMode === 'line-wrap'}
				<NumberInput
					label="wrap width"
					min={50}
					max={5000}
					step={10}
					bind:value={$patternConfigStore.patternViewConfig.wrapWidth as number}
				/>
			{/if}
			<NumberInput
				label="gap"
				min={0}
				max={500}
				step={1}
				bind:value={$patternConfigStore.patternViewConfig.gap as number}
			/>
		</div>
		<div>
			<div>
				<span>Range</span>
				<button
					on:click={() => {
						rangeTubes = undefined;
						rangeBands = undefined;
						rangeFacets = undefined;
					}}>all</button
				>
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
		<div>
			<select bind:value={$patternConfigStore.patternViewConfig.bandSortMode}>
				<option value="tube-order">Tube order</option>
				<option value="end-connection-tube">End connection</option>
			</select>
			<select bind:value={$patternConfigStore.patternViewConfig.patternSource}>
				<option value="projection">Projection</option>
				<option value="surfaceProjection">Surface</option>
				<option value="voronoi">Voronoi</option>
				<option value="voronoiSurface">Voronoi Surface</option>
			</select>
			{#if $patternConfigStore.patternViewConfig.patternSource === 'surfaceProjection' && $superConfigStore.projectionConfigs[0]?.surfaceProjectionConfig}
				<NumberInput
					label="divisions"
					min={0}
					max={5}
					step={1}
					bind:value={$superConfigStore.projectionConfigs[0].surfaceProjectionConfig.divisions}
				/>
				<label>
					fill all
					<input
						type="checkbox"
						checked={$superConfigStore.projectionConfigs[0].surfaceProjectionConfig.fillAll ??
							false}
						on:change={(e) => {
							const checked = (e.currentTarget as HTMLInputElement).checked;
							$superConfigStore = {
								...$superConfigStore,
								projectionConfigs: $superConfigStore.projectionConfigs.map((pc, i) =>
									i === 0
										? {
												...pc,
												surfaceProjectionConfig: {
													...pc.surfaceProjectionConfig!,
													fillAll: checked
												}
											}
										: pc
								)
							};
						}}
					/>
				</label>
			{:else if $patternConfigStore.patternViewConfig.patternSource === 'voronoiSurface' && $superConfigStore.voronoiConfig}
				<label>
					fill all
					<input
						type="checkbox"
						checked={$superConfigStore.voronoiConfig.fillAll ?? false}
						on:change={(e) => {
							const checked = (e.currentTarget as HTMLInputElement).checked;
							$superConfigStore = {
								...$superConfigStore,
								voronoiConfig: { ...$superConfigStore.voronoiConfig!, fillAll: checked }
							};
						}}
					/>
				</label>
			{/if}
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
	.mode-cycle {
		display: block;
		margin: 2px 0;
		padding: 2px 8px;
		font-family: monospace;
		font-size: 12px;
		cursor: pointer;
	}
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
