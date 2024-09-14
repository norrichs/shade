<script lang="ts">
	import ThreeRenderer from '../../components/three-renderer-v2/ThreeRenderer.svelte';
	import CutPattern from '../../components/cut-pattern/CutPattern.svelte';
	import type { Level } from '$lib/types';
	import TilingControl from '../../components/controls/TilingControl.svelte';
	import CutControl from '../../components/controls/CutControl.svelte';
	import ShowControl from '../../components/controls/ShowControl.svelte';
	import StrutControl from '../../components/controls/StrutControl.svelte';
	import LevelControl from '../../components/controls/LevelControl.svelte';
	import PathEdit from '../../components/path-edit/PathEdit.svelte';
	import { superGlobuleStore, superGlobuleGeometryStore } from '$lib/stores/index';
	import SelectBar from '../../components/select-bar/SelectBar.svelte';
	import SaveControl from '../../components/save-control/SaveControl.svelte';
	import DataControl from '../../components/save-control/DataControl.svelte';
	import Scene from '../../components/three-renderer-v2/Scene.svelte';
	import { configStore0, superConfigStore } from '$lib/stores';
	import SuperPathEdit from '../../components/path-edit/SuperPathEdit.svelte';

	let displayLevels: Level[];
	let showControl: { name: string; value?: unknown } = { name: 'None' };

	type ShowControlCurveValue = 'ShapeConfig' | 'DepthCurveConfig' | 'SilhouetteConfig';
	const isShowControlCurveValue = (value: unknown): value is ShowControlCurveValue => {
		return ['ShapeConfig', 'DepthCurveConfig', 'SilhouetteConfig', 'SpineCurveConfig'].includes(
			value as string
		);
	};
</script>

<main>
	<section class="container three">
		<ThreeRenderer>
			<Scene />
		</ThreeRenderer>
	</section>
	<!-- <section class="container svg">
		<CutPattern />
	</section> -->
	<section class="container controls">
		<header>
			<SelectBar
				bind:value={showControl}
				options={[
					{ name: 'None' },
					{ name: 'Silhouette', value: 'SilhouetteConfig' },
					{ name: 'DepthCurve', value: 'DepthCurveConfig' },
					{ name: 'Spine', value: 'SpineCurveConfig' },
					{ name: 'Shape', value: 'ShapeConfig' },
					{ name: '3D' },
					{ name: 'Levels' },
					{ name: 'Struts' },
					{ name: 'Cut' },
					{ name: 'Pattern' },
					// { name: 'Save' },
					{ name: 'Data' }
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
			{:else if showControl?.name === 'Struts'}
				<StrutControl />
			{:else if showControl?.name === '3D'}
				<ShowControl />
			{:else if showControl?.name === 'Levels'}
				<LevelControl />
			{:else if showControl?.name === 'Cut'}
				<CutControl />
			{:else if showControl?.name === 'Pattern'}
				<TilingControl />
				<!-- {:else if showControl?.name === 'Save'}
				<SaveControl show={showControl?.name === 'Save'} config={$superConfigStore} /> -->
			{:else if showControl?.name === 'Data'}
				<DataControl />
			{/if}
		</div>
	</section>
</main>

<style>
	main {
		height: 100vh;
		width: 100%;

		display: grid;
		grid-template-rows: 1fr 1fr;
		grid-template-columns: 1fr 1fr;
	}
	section.container {
		height: 100%;
		width: 100%;
		border: 1px solid gray;
	}
	section.container.three {
		grid-column: 1 / 2;
		grid-row: 1 / 3;
	}
	section.container.controls {
		grid-column: 2 / 3;
		grid-row: 1 / 2;
		display: flex;
		flex-direction: column;
	}
	.container.controls .group {
		display: flex;
		flex-direction: row;
		justify-content: flex-start;
	}

	section.container.svg {
		grid-column: 2/ 3;
		grid-row: 2 / 3;
	}
</style>
