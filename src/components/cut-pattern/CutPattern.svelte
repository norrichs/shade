<script lang="ts">
	import LoggerControls from '../svg-logger/LoggerControls.svelte';
	import { superGlobulePatternStore } from '$lib/stores';
	import { show_svg } from '$lib/util';
	import CutPatternControl from './CutPatternControl.svelte';
	import CutPatternSvg from './CutPatternSvg.svelte';
	import PatternedBandComponent from './PatternedBand.svelte';

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
</script>

<div>{$superGlobulePatternStore.bandPatterns.length}</div>
<div class="container">
	<header>
		<button on:click={() => show_svg('pattern-svg')}>Download</button>
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
	</header>

	<div>
		<div class="container-svg" class:showBands>
			<CutPatternSvg>
				{#each $superGlobulePatternStore.bandPatterns as band, index}
					{#if band.projectionType === 'patterned'}
						<PatternedBandComponent {band} {index} />
					{/if}
				{/each}
				<!-- <SvgLogger /> -->
			</CutPatternSvg>
			<CutPatternControl />
		</div>
	</div>
</div>

<style>
	#outer-svg {
		background-color: beige;
	}
	#pattern-svg {
		background-color: red;
	}
	.patterned-path-transformed {
		fill: rgba(255, 20, 145, 0.288);
		stroke: deeppink;
	}

	.patterned-path-flattened {
		fill: rgba(102, 51, 153, 0.771);
		stroke: deeppink;
	}

	.container {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
	}
	.container-svg {
		min-width: 2000px;
		display: none;
		flex-direction: column;
		margin-top: 10px;
		padding: 20px;
		box-shadow: 0 0 10px 2px black;
		position: relative;
	}
	.showBands {
		display: flex;
	}
</style>
