<script lang="ts">
	import {
		superGlobulePatternStore,
		patternConfigStore,
		patternSourceStore,
		viewControlStore,
		collatedTubesStore
	} from '$lib/stores';
	import CutPatternControl from './CutPatternControl.svelte';
	import CutPatternSvg from './CutPatternSvg.svelte';

	import ProjectionPanelPatterns from './ProjectionPanelPatterns.svelte';
	import { mmFromInches } from '$lib/patterns/utils';
	import CutPatternRenderer from './CutPatternRenderer.svelte';
	import { buildBandSortIndex } from '$lib/cut-pattern/band-sort-index';
	import { collectBandErrors } from '$lib/cut-pattern/collect-band-errors';
	import type { BandSortIndex, TubeCutPattern } from '$lib/types';

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

	// One shared definition of "the tubes in scope", so this view and the Splits
	// panel cannot drift (collate-tubes.ts:28-38).
	let collatedPatterns: TubeCutPattern[] = [];
	$: collatedPatterns = $collatedTubesStore;

	let sortMode = $patternConfigStore.patternViewConfig.bandSortMode ?? 'tube-order';
	$: sortMode = $patternConfigStore.patternViewConfig.bandSortMode ?? 'tube-order';

	let sortIndex: BandSortIndex | undefined;
	$: sortIndex =
		sortMode === 'tube-order' ? undefined : buildBandSortIndex(collatedPatterns, sortMode);

	let bandErrors: string[] = [];
	$: bandErrors = collectBandErrors([
		$superGlobulePatternStore.globuleTubePattern,
		$superGlobulePatternStore.projectionPattern,
		$superGlobulePatternStore.surfaceProjectionPattern,
		$superGlobulePatternStore.voronoiPattern,
		$superGlobulePatternStore.voronoiSurfacePattern
	]);
</script>

<div class="container-svg scroll-container" class:showBands>
	{#if bandErrors.length}
		<div class="band-errors" role="alert">
			<strong>{bandErrors.length} band{bandErrors.length === 1 ? '' : 's'} not patterned</strong>
			<ul>
				{#each bandErrors as message, i (i)}
					<li>{message}</li>
				{/each}
			</ul>
		</div>
	{/if}
	<div class="scroll-container">
		<CutPatternSvg width={6000} height={6000}>
			<CutPatternRenderer
				tubes={collatedPatterns}
				{sortIndex}
				selectionTarget={$patternSourceStore}
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
	.band-errors {
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
		border: 1px solid #c77;
		background: #fdf1f1;
		color: #822;
		font-size: 0.85rem;
	}
	.band-errors ul {
		margin: 0.25rem 0 0;
		padding-left: 1.25rem;
	}
</style>
