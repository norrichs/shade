<script lang="ts">
	import {
		superGlobulePatternStore,
		patternConfigStore,
		viewControlStore
	} from '$lib/stores';
	import CutPatternControl from './CutPatternControl.svelte';
	import CutPatternSvg from './CutPatternSvg.svelte';

	import ProjectionPanelPatterns from './ProjectionPanelPatterns.svelte';
	import { mmFromInches } from '$lib/patterns/utils';
	import CutPatternRenderer from './CutPatternRenderer.svelte';
	import { collateTubes } from '$lib/cut-pattern/collate-tubes';
	import type { TubeCutPattern } from '$lib/types';

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

	let collatedPatterns: TubeCutPattern[] = [];
	$: collatedPatterns = collateTubes({
		globuleTubePattern: $superGlobulePatternStore.globuleTubePattern,
		projectionPattern: $superGlobulePatternStore.projectionPattern,
		surfaceProjectionPattern: $superGlobulePatternStore.surfaceProjectionPattern,
		voronoiPattern: $superGlobulePatternStore.voronoiPattern,
		voronoiSurfacePattern: $superGlobulePatternStore.voronoiSurfacePattern,
		showGlobuleTubeGeometry: $viewControlStore.showGlobuleTubeGeometry,
		showProjectionGeometry: $viewControlStore.showProjectionGeometry,
		showVoronoiGeometry: $viewControlStore.showVoronoiGeometry,
		patternSource: $patternConfigStore.patternViewConfig.patternSource ?? 'projection'
	});
</script>

<div class="container-svg scroll-container" class:showBands>
	<div class="scroll-container">
		<CutPatternSvg width={6000} height={6000}>
			<CutPatternRenderer
				tubes={collatedPatterns}
				selectionTarget={$patternConfigStore.patternViewConfig.patternSource ?? 'projection'}
			/>

			{#if $superGlobulePatternStore.projectionPattern && $viewControlStore.showProjectionGeometry.any}
				<ProjectionPanelPatterns
					showSelectedOnly={undefined}
					range={$patternConfigStore.patternViewConfig.range}
					patternStyle="view"
					labelSize={2.15}
					showScalebar={true}
					verbose={true}
				/>
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
