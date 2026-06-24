<script lang="ts">
	import ThreeRenderer from '../../components/three-renderer/ThreeRenderer.svelte';
	import Scene from '../../components/three-renderer/Scene.svelte';
	import PatternViewer from '../../components/cut-pattern/PatternViewer.svelte';
	import PatternData from '../../components/cut-pattern/PatternData.svelte';
	import HoverSidebar from '../../components/modal/HoverSidebar.svelte';
	import { assemblerConfigs } from '../../components/modal/sidebar-definitions';
	import Toast from '../../components/Toast.svelte';

	import { superGlobulePatternStore, patternConfigStore, viewControlStore } from '$lib/stores';
	import { collateTubes } from '$lib/cut-pattern/collate-tubes';
	import { buildBandSortIndex } from '$lib/cut-pattern/band-sort-index';
	import { buildPatternCsv } from '$lib/cut-pattern/build-pattern-csv';

	// Compute the same CSV data the pattern export produces, derived from the
	// live pattern/config/view stores, and hand it to PatternData to render.
	let csv = $derived.by(() => {
		const patternState = $superGlobulePatternStore as any;
		if (!patternState || typeof patternState === 'string') return '';
		try {
			const config = $patternConfigStore;
			const view = $viewControlStore;
			const tubes = collateTubes({
				globuleTubePattern: patternState.globuleTubePattern,
				projectionPattern: patternState.projectionPattern,
				surfaceProjectionPattern: patternState.surfaceProjectionPattern,
				voronoiPattern: patternState.voronoiPattern,
				voronoiSurfacePattern: patternState.voronoiSurfacePattern,
				showGlobuleTubeGeometry: view.showGlobuleTubeGeometry,
				showProjectionGeometry: view.showProjectionGeometry,
				patternSource: config.patternViewConfig.patternSource ?? 'projection'
			});
			if (!tubes.length) return '';
			const mode = config.patternViewConfig.bandSortMode ?? 'tube-order';
			const index = buildBandSortIndex(tubes, mode);
			return buildPatternCsv(index, tubes);
		} catch (e) {
			console.warn('Assembler: failed to build pattern CSV', e);
			return '';
		}
	});
</script>

<main>
	<Toast />
	<section class="pane pane-three">
		<ThreeRenderer>
			<Scene />
		</ThreeRenderer>
	</section>
	<section class="pane pane-pattern">
		<PatternViewer />
	</section>
	<section class="pane pane-data">
		<PatternData {csv} />
	</section>
	<HoverSidebar sidebarDefinition={assemblerConfigs} />
</main>

<style>
	main {
		height: calc(100vh - var(--nav-header-height));
		width: 100vw;

		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: minmax(0, 1fr) 300px;
	}
	section.pane {
		border: 1px solid gray;
		overflow: hidden;
	}
	section.pane-three {
		grid-column: 1 / 2;
		grid-row: 1 / 2;
	}
	section.pane-pattern {
		grid-column: 2 / 3;
		grid-row: 1 / 2;
	}
	section.pane-data {
		grid-column: 1 / 3;
		grid-row: 2 / 3;
		height: 300px;
		overflow: auto;
	}
</style>
