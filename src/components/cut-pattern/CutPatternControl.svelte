<script lang="ts">
	import type { ProjectionRange } from '#lib/projection-geometry/filters.js';
	import {
		patternConfigStore,
		patternFilterSettings,
		patternFilterSet,
		setPatternFilterSettings,
		clearPatternFilter
	} from '#lib/stores/index.js';
	import {
		describePatternFilter,
		isFilteringMode,
		type PatternFilterCombine,
		type PatternFilterMode
	} from '#lib/cut-pattern/pattern-filter.js';

	const FILTER_MODES: { value: PatternFilterMode; label: string }[] = [
		{ value: 'off', label: 'off' },
		{ value: 'focus', label: 'focus' },
		{ value: 'band', label: 'filter band' },
		{ value: 'tube', label: 'filter tube' }
	];
	const onFilterMode = (e: Event) =>
		setPatternFilterSettings({
			mode: (e.currentTarget as HTMLSelectElement).value as PatternFilterMode
		});
	const onFilterCombine = (e: Event) =>
		setPatternFilterSettings({
			combine: (e.currentTarget as HTMLSelectElement).value as PatternFilterCombine
		});
	import CheckboxInput from '../controls/CheckboxInput.svelte';
	import NumberInput from '../controls/super-control/NumberInput.svelte';
	import PanControl from './PanControl.svelte';
	import PageNavControl from './PageNavControl.svelte';

	export let onNavigate: (() => void) | undefined = undefined;

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
</script>

<div class="view-control-box">
	<PageNavControl {onNavigate} />
	<div class="row filter-row" data-testid="pattern-filter">
		<label>
			<span>Click filter</span>
			<select value={$patternFilterSettings.mode} on:change={onFilterMode}>
				{#each FILTER_MODES as m (m.value)}
					<option value={m.value}>{m.label}</option>
				{/each}
			</select>
		</label>
		<select
			value={$patternFilterSettings.combine}
			on:change={onFilterCombine}
			disabled={!isFilteringMode($patternFilterSettings.mode)}
			title="exclusive: one band/tube at a time; additive: clicks add or remove"
		>
			<option value="exclusive">exclusive</option>
			<option value="additive">additive</option>
		</select>
		{#if isFilteringMode($patternFilterSettings.mode)}
			<span class="filter-summary">{describePatternFilter($patternFilterSet)}</span>
			<button on:click={clearPatternFilter} disabled={!$patternFilterSet}>show all</button>
		{/if}
	</div>
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
	.filter-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		margin-bottom: 6px;
	}
	.filter-summary {
		min-width: 6em;
	}
	.range-inputs {
		display: flex;
		flex-direction: row;
		gap: 0px;
	}
	.view-control-box {
		flex: none;
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
