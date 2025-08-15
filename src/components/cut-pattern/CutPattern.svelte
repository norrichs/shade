<script lang="ts">
	import {
		superGlobulePatternStore,
		patternConfigStore,
		viewControlStore,
		selectedProjectionGeometry
	} from '$lib/stores';
	import CutPatternControl from './CutPatternControl.svelte';
	import CutPatternSvg from './CutPatternSvg.svelte';
	import PatternedBand from './PatternedBand.svelte';
	import BandComponent from './BandComponent.svelte';
	import QuadPattern from '../pattern-svg/QuadPattern.svelte';
	import BandPanelComponent from './BandPanelComponent.svelte';
	import PanelComponent from './PanelComponent.svelte';
	import type { BandPanelPattern } from '$lib/types';
	import type { ProjectionAddress_Facet } from '$lib/projection-geometry/types';
	import ProjectionPanelPatterns from './ProjectionPanelPatterns.svelte';
	import { mmFromInches } from '$lib/patterns/utils';
	import ProjectionBandPattern from './ProjectionBandPattern.svelte';

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
			<ProjectionBandPattern projectionPattern={$superGlobulePatternStore.projectionPattern} />
			<ProjectionPanelPatterns
				showSelectedOnly={false}
				range={{ tubes: [0, 1], bands: [2, 4] }}
				patternStyle="view"
				labelSize={6}
				scaleBar={{
					unit: 'mm',
					unitPerSvgUnit: mmFromInches(1) / 20,
					quantity: Math.round(mmFromInches(24) * 10) / 10,
					secondary: {
						quantity: 24,
						unit: 'inch'
					}
				}}
			/>

			{#if $viewControlStore.showGlobuleGeometry.any}
				<circle cx={100} cy={100} r={20} />
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
