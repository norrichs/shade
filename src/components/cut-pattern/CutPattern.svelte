<script lang="ts">
	import { superGlobulePatternStore, patternConfigStore, viewControlStore } from '$lib/stores';
	import CutPatternControl from './CutPatternControl.svelte';
	import CutPatternSvg from './CutPatternSvg.svelte';
	import PatternedBand from './PatternedBand.svelte';
	import BandComponent from './BandComponent.svelte';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';

	let showBands = true;
	let showQuadPattern = false;
	let showTabs = true;
	let useExpandStroke = false;
	let useLabels = true;

	const colorCycle = (index: number) => {
		const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
		return colors[index % 6];
	};

	type FlattenMode = 'native-replace' | 'recombine'; // WTF is this. Still relevant?

	let flattenedPatternedSVG: { bands: string[] } = { bands: [] };

	console.debug('superGlobulePatternStore', $superGlobulePatternStore);
</script>

<!-- <header>
	<button on:click={() => (useExpandStroke = !useExpandStroke)}
		>{useExpandStroke ? "Don't Expand Stroke" : 'Expand Stroke'}</button
	>
	<button on:click={() => (useLabels = !useLabels)}>{useLabels ? "Don't Label" : 'Label'}</button>
	<button on:click={() => (showQuadPattern = !showQuadPattern)}
		>{showQuadPattern ? "Don't show quads" : 'Show quads'}</button
	>
	<label for="showBands"> Bands </label>
	<input type="checkbox" name="showBands" bind:checked={showBands} />
	{#if flattenedPatternedSVG.bands.length > 0}
		<div>FLATTENED PATTERNED</div>
	{/if}
	<LoggerControls />
</header> -->

<div class="container-svg scroll-container" class:showBands>
	<div class="scroll-container">
		<CutPatternSvg>
			{#if $viewControlStore.showProjectionGeometry.any && $viewControlStore.showProjectionGeometry.bands}
				{#each $superGlobulePatternStore.projectionPattern?.bandPatterns || [] as band, index}
					<BandComponent {band} {index} showLabel>
						{#if band.projectionType === 'patterned'}
							<PatternedBand {band} />
						{/if}
						<QuadPattern
						{band}
						showQuads={$patternConfigStore.patternViewConfig.showQuads}
						showLabels={$patternConfigStore.patternViewConfig.showLabels}
					/>
					</BandComponent>
				{/each}
			{/if}
			{#if $viewControlStore.showGlobuleGeometry.any}
				{#each $superGlobulePatternStore.superGlobulePattern?.bandPatterns || [] as band, index}
					<BandComponent {band} {index} showLabel>
						{#if band.projectionType === 'patterned'}
							<PatternedBand {band} />
						{/if}
						<QuadPattern
							{band}
							showQuads={$patternConfigStore.patternViewConfig.showQuads}
							showLabels={$patternConfigStore.patternViewConfig.showLabels}
						/>
					</BandComponent>
				{/each}
			{/if}

			<!-- <SvgLogger /> -->
		</CutPatternSvg>
	</div>
	<CutPatternControl />
</div>

<style>
	.scroll-container {
		height: inherit;
		width: inherit;
		overflow-y: scroll;
		overflow-x: scroll;
	}

	.container {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
	}
	.container-svg {
		display: none;
		flex-direction: column;
		padding: 0px;
		box-shadow: 0 0 10px 2px black;
		position: relative;
	}
	.showBands {
		display: flex;
	}
</style>
