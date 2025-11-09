<script lang="ts">
	import { superGlobulePatternStore, patternConfigStore, viewControlStore } from '$lib/stores';
	import CutPatternControl from './CutPatternControl.svelte';
	import CutPatternSvg from './CutPatternSvg.svelte';
	import BandCutPatternComponent from './BandCutPatternComponent.svelte';
	import BandComponent from './BandComponent.svelte';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';

	import ProjectionPanelPatterns from './ProjectionPanelPatterns.svelte';
	import { mmFromInches } from '$lib/patterns/utils';
	import ProjectionCutPattern from './ProjectionCutPattern.svelte';

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

<div class="container-svg scroll-container" class:showBands>
	<div class="scroll-container">
		<CutPatternSvg width={6000} height={6000}>
			{#if $superGlobulePatternStore.globuleTubePattern}
				<ProjectionCutPattern projectionPattern={$superGlobulePatternStore.projectionPattern} />
			{/if}
			<ProjectionPanelPatterns
				showSelectedOnly={undefined}
				range={$patternConfigStore.patternViewConfig.range}
				patternStyle="view"
				labelSize={2.15}
				showScalebar={true}
				verbose={true}
			/>

			{#if $viewControlStore.showGlobuleGeometry.any}
				{#each $superGlobulePatternStore.superGlobulePattern?.bandPatterns || [] as band, index}
					<BandComponent {band} {index} showLabel>
						{#if band.projectionType === 'patterned'}
							<BandCutPatternComponent {band} />
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
