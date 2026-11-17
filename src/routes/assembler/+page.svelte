<script lang="ts">
	import ThreeRenderer from '../../components/three-renderer/ThreeRenderer.svelte';
	import Scene from '../../components/three-renderer/Scene.svelte';
	import PatternViewer from '../../components/cut-pattern/PatternViewer.svelte';
	import PatternData from '../../components/cut-pattern/PatternData.svelte';
	import HoverSidebar from '../../components/modal/HoverSidebar.svelte';
	import { assemblerConfigs } from '../../components/modal/sidebar-definitions';
	import Toast from '../../components/Toast.svelte';

	import {
		superGlobulePatternStore,
		patternConfigStore,
		viewControlStore
	} from '#lib/stores/index.js';
	import { collateTubes } from '#lib/cut-pattern/collate-tubes.js';
	import { buildBandSortIndex } from '#lib/cut-pattern/band-sort-index.js';
	import { buildPatternCsv } from '#lib/cut-pattern/build-pattern-csv.js';
	import type { BandSortIndex, TubeCutPattern } from '#lib/types.js';
	import PaneDivider from '../../components/layout/PaneDivider.svelte';
	import {
		assemblerPanels,
		clampAssemblerPanels,
		type AssemblerPanels
	} from '#lib/stores/uiStores.js';

	let main: HTMLElement | undefined = $state();
	// Clamp on read too, so a stale stored layout can't collapse a pane.
	const panels = $derived(clampAssemblerPanels($assemblerPanels, 'top'));
	// ×100: flex factors summing to just under 1 (float error) would leave space unfilled.
	const fr = (fraction: number) => `${fraction * 100}fr`;
	const move = (key: keyof AssemblerPanels) => (fraction: number) => {
		$assemblerPanels = clampAssemblerPanels({ ...panels, [key]: fraction }, key);
	};

	// Collate the live tubes once, then derive the sort index and CSV from them.
	// PatternData needs the structured `tubes`/`index` (which carry full
	// {globule, tube, band} addresses) to resolve a clicked member cell back to a
	// band — the CSV text omits the globule index.
	let tubes = $derived.by<TubeCutPattern[]>(() => {
		const patternState = $superGlobulePatternStore;
		if (!patternState || typeof patternState === 'string') return [];
		try {
			const config = $patternConfigStore;
			const view = $viewControlStore;
			return collateTubes({
				globuleTubePattern: patternState.globuleTubePattern,
				projectionPattern: patternState.projectionPattern,
				surfaceProjectionPattern: patternState.surfaceProjectionPattern,
				voronoiPattern: patternState.voronoiPattern,
				voronoiSurfacePattern: patternState.voronoiSurfacePattern,
				showGlobuleTubeGeometry: view.showGlobuleTubeGeometry,
				showProjectionGeometry: view.showProjectionGeometry,
				patternSource: config.patternViewConfig.patternSource ?? 'projection'
			});
		} catch (e) {
			console.warn('Assembler: failed to collate tubes', e);
			return [];
		}
	});

	let index = $derived.by<BandSortIndex | undefined>(() => {
		if (!tubes.length) return undefined;
		const mode = $patternConfigStore.patternViewConfig.bandSortMode ?? 'tube-order';
		try {
			return buildBandSortIndex(tubes, mode);
		} catch (e) {
			console.warn('Assembler: failed to build band sort index', e);
			return undefined;
		}
	});

	let csv = $derived(index ? buildPatternCsv(index, tubes) : '');
</script>

<main
	bind:this={main}
	style:grid-template-columns={`${fr(panels.left)} ${fr(panels.right - panels.left)} ${fr(1 - panels.right)}`}
	style:grid-template-rows={`minmax(0, ${fr(panels.top)}) minmax(0, ${fr(1 - panels.top)})`}
>
	<Toast />
	<section class="pane pane-three">
		<ThreeRenderer>
			<Scene />
		</ThreeRenderer>
	</section>
	<section class="pane pane-band"></section>
	<section class="pane pane-pattern">
		<PatternViewer />
	</section>
	<section class="pane pane-data">
		<PatternData {csv} {index} {tubes} />
	</section>
	<PaneDivider
		orientation="vertical"
		position={panels.left}
		extent={panels.top}
		container={main}
		onchange={move('left')}
	/>
	<PaneDivider
		orientation="vertical"
		position={panels.right}
		extent={panels.top}
		container={main}
		onchange={move('right')}
	/>
	<PaneDivider
		orientation="horizontal"
		position={panels.top}
		container={main}
		onchange={move('top')}
	/>
	<HoverSidebar sidebarDefinition={assemblerConfigs} />
</main>

<style>
	main {
		position: relative;
		height: calc(100vh - var(--nav-header-height));
		width: 100vw;

		display: grid;
	}
	section.pane {
		box-sizing: border-box;
		min-width: 0;
		min-height: 0;
		border: 1px solid gray;
		overflow: hidden;
	}
	section.pane-three {
		grid-column: 1 / 2;
		grid-row: 1 / 2;
	}
	section.pane-band {
		grid-column: 2 / 3;
		grid-row: 1 / 2;
	}
	section.pane-pattern {
		grid-column: 3 / 4;
		grid-row: 1 / 2;
	}
	section.pane-data {
		grid-column: 1 / 4;
		grid-row: 2 / 3;
		overflow: auto;
	}
</style>
