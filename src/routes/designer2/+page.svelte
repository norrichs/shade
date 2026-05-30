<script lang="ts">
	import ThreeRenderer from '../../components/three-renderer/ThreeRenderer.svelte';
	import PatternViewer from '../../components/cut-pattern/PatternViewer.svelte';
	import TilingControl from '../../components/controls/TilingControl.svelte';
	import ShowControl from '../../components/controls/ShowControl.svelte';
	import StrutControl from '../../components/controls/StrutControl.svelte';
	import LevelControl from '../../components/controls/LevelControl.svelte';
	import SelectBar from '../../components/select-bar/SelectBar.svelte';
	import Scene from '../../components/three-renderer/Scene.svelte';

	import SuperPathEdit from '../../components/path-edit/SuperPathEdit.svelte';
	import SuperControl from '../../components/controls/super-control/SuperControl.svelte';
	import { uiStore, type ViewModeSetting, computationMode } from '$lib/stores/uiStores';
	import ProjectionControl from '../../components/projection/ProjectionControl.svelte';
	import VoronoiControl from '../../components/controls/VoronoiControl.svelte';
	import HoverSidebar from '../../components/modal/HoverSidebar.svelte';
	import Floater from '../../components/modal/Floater.svelte';
	import { projectionConfigs } from '../../components/modal/sidebar-definitions';
	import Toast from '../../components/Toast.svelte';

	let viewMode: ViewModeSetting = $uiStore.designer.viewMode;
	let showVoronoiFloater = false;

	let showControl: { name: string; value?: unknown } = { name: 'None' };
	type ShowControlCurveValue = 'ShapeConfig' | 'DepthCurveConfig' | 'SilhouetteConfig';
	const isShowControlCurveValue = (value: unknown): value is ShowControlCurveValue => {
		return ['ShapeConfig', 'DepthCurveConfig', 'SilhouetteConfig', 'SpineCurveConfig'].includes(
			value as string
		);
	};

	$: viewMode = $uiStore.designer.viewMode;
	$: if (showControl?.name === 'Voronoi') {
		showVoronoiFloater = true;
	}
</script>

<main>
	<Toast />
	<section class={`container ${viewMode === 'three' ? 'primary' : 'secondary'}`}>
		<ThreeRenderer>
			<Scene />
		</ThreeRenderer>
	</section>
	{#if $computationMode !== '3d-only'}
		<section class={`container ${viewMode === 'pattern' ? 'primary' : 'secondary'}`}>
			<PatternViewer />
		</section>
	{/if}
	<section class="container controls">
		<header>
			<SelectBar
				bind:value={showControl}
				options={[
					{ name: 'Silhouette', value: 'SilhouetteConfig' },
					{ name: 'Depth', value: 'DepthCurveConfig' },
					{ name: 'Spine', value: 'SpineCurveConfig' },
					{ name: 'Shape', value: 'ShapeConfig' },
					{ name: 'Projection' },
					{ name: 'Voronoi' },
					{ name: 'Levels' },
					{ name: 'Struts' },
					{ name: 'Cut' },
					{ name: 'Pattern' },
					{ name: 'Super' }
				]}
			/>
		</header>
		<div class="group">
			{#if ['Silhouette', 'Shape', 'DepthCurve', 'Spine'].includes(showControl?.name)}
				<SuperPathEdit
					curveStoreType={isShowControlCurveValue(showControl.value)
						? showControl.value
						: 'SilhouetteConfig'}
				/>
			{:else if showControl?.name === 'Projection'}
				<ProjectionControl />
			{:else if showControl?.name === 'Struts'}
				<StrutControl />
			{:else if showControl?.name === 'Levels'}
				<LevelControl />
				<!-- {:else if showControl?.name === 'Cut'}
				<CutControl /> -->
			{:else if showControl?.name === 'Pattern'}
				<TilingControl />
			{:else if showControl?.name === 'Super'}
				<SuperControl />
			{/if}
		</div>
	</section>
	<HoverSidebar sidebarDefinition={projectionConfigs} />
	<Floater
		title="Voronoi"
		showFloater={showVoronoiFloater}
		onClose={() => (showVoronoiFloater = false)}
		content={VoronoiControl}
		closeOnClickAway={false}
	/>
</main>

<style>
	main {
		--designer-height: calc(100vh - var(--nav-header-height));
		--half-designer-height: calc(var(--designer-height) / 2);
		--secondary-width: 600px;
		height: var(--designer-height);
		width: 100vw;

		display: grid;
		grid-template-rows: repeat(2, var(--half-designer-height));
		grid-template-columns: auto var(--secondary-width);
	}
	section.container {
		/* height: 100%; */
		/* width: 100%; */
		border: 1px solid gray;
	}
	section.container.primary {
		height: 100%;
		/* width: 100%; */
		width: calc(100vw - var(--secondary-width));
		grid-column: 1 / 2;
		grid-row: 1 / 3;
	}
	section.container.controls {
		height: var(--half-designer-height);
		max-height: var(--half-designer-height);
		grid-column: 2 / 3;
		grid-row: 1 / 2;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}
	section.container.controls header {
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.container.controls .group {
		width: 100%;
		display: flex;
		flex-direction: row;
		justify-content: flex-start;
	}

	section.container.secondary {
		height: var(--half-designer-height);
		grid-column: 2/ 3;
		grid-row: 2 / 3;
	}
</style>
