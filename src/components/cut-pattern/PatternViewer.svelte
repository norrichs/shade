<script lang="ts">
	import {
		superGlobulePatternStore,
		patternConfigStore,
		patternSourceStore,
		viewControlStore,
		collatedTubesStore,
		pageLayoutInfoStore,
		patternFocusRequest
	} from '#lib/stores/index.js';
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { bandFilterKey } from '#lib/cut-pattern/pattern-filter.js';
	import { geometrySourceOfPattern } from '#lib/cut-pattern/pattern-band-space.js';
	import { bandElements, focusOffsetForBand } from './focus-pattern-band';
	import CutPatternControl from './CutPatternControl.svelte';
	import CutPatternSvg from './CutPatternSvg.svelte';

	import ProjectionPanelPatterns from './ProjectionPanelPatterns.svelte';
	import { mmFromInches } from '#lib/patterns/utils.js';
	import CutPatternRenderer from './CutPatternRenderer.svelte';
	import { pinchZoom } from './pinch-zoom.js';
	import { buildBandSortIndex } from '#lib/cut-pattern/band-sort-index.js';
	import { collectBandErrors } from '#lib/cut-pattern/collect-band-errors.js';
	import type { BandSortIndex, BandSortMode, TubeCutPattern } from '#lib/types.js';

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
	let collatedPatterns: TubeCutPattern[];
	$: collatedPatterns = $collatedTubesStore;

	let sortMode: BandSortMode;
	$: sortMode = $patternConfigStore.patternViewConfig.bandSortMode ?? 'tube-order';

	let sortIndex: BandSortIndex | undefined;
	$: sortIndex =
		sortMode === 'tube-order' ? undefined : buildBandSortIndex(collatedPatterns, sortMode);

	// Page navigation lines a page's top-left up with the view's, which only
	// holds while the svg area is scrolled to its own top-left.
	let svgArea: HTMLDivElement;
	const resetScroll = () => svgArea?.scrollTo(0, 0);

	// Pattern filter focus: pan (never zoom) onto a clicked band once the layout
	// has placed it. A click re-runs the layout, so the band may not be drawn, or
	// drawn where it will end up, until a few frames later — and a nest layout
	// answers from a worker, so wait for it to settle before the final pan.
	const FOCUS_TIMEOUT_MS = 2000;
	const focusBand = async (seq: number, key: string) => {
		await tick();
		const deadline = performance.now() + FOCUS_TIMEOUT_MS;
		const cfg = get(patternConfigStore);
		const nestLayout =
			cfg.patternViewConfig.patternLayoutMode === 'page' &&
			cfg.patternConfig.pageLayout?.algorithm === 'nest';
		let sawPending = false;
		const attempt = () => {
			if (get(patternFocusRequest)?.seq !== seq) return; // superseded by a newer click
			const pending = !!get(pageLayoutInfoStore).nestPending;
			sawPending ||= pending;
			if (!pending && svgArea && bandElements(svgArea, key).length > 0) {
				const next = focusOffsetForBand(
					svgArea,
					key,
					get(patternConfigStore).patternViewConfig.centerOffset
				);
				if (next) $patternConfigStore.patternViewConfig.centerOffset = next;
				if (!nestLayout || sawPending) return;
			}
			if (performance.now() < deadline) requestAnimationFrame(attempt);
		};
		requestAnimationFrame(attempt);
	};

	onMount(() => {
		let initial = true;
		const unsubscribe = patternFocusRequest.subscribe((req) => {
			// The current value on subscribe is an old click, not a new request.
			if (initial || !req) return;
			if (req.source !== geometrySourceOfPattern(get(patternSourceStore))) return;
			focusBand(req.seq, bandFilterKey(req.band));
		});
		initial = false;
		return unsubscribe;
	});

	let bandErrors: string[];
	$: bandErrors = collectBandErrors([
		$superGlobulePatternStore.globuleTubePattern,
		$superGlobulePatternStore.projectionPattern,
		$superGlobulePatternStore.surfaceProjectionPattern,
		$superGlobulePatternStore.voronoiPattern,
		$superGlobulePatternStore.voronoiSurfacePattern
	]);
</script>

<div class="container-svg" class:showBands>
	<CutPatternControl onNavigate={resetScroll} />
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
	<div class="scroll-container" bind:this={svgArea} use:pinchZoom>
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
</div>

<style>
	.scroll-container {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: scroll;
		overflow-x: scroll;
	}

	.container-svg {
		display: none;
		flex-direction: column;
		padding: 0px;
		box-shadow: 0 0 10px 2px black;
		position: relative;
		height: 100%;
		box-sizing: border-box;
		overflow: hidden;
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
