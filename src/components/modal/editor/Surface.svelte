<script lang="ts">
	import { getCrossSectionPath } from '$lib/projection-geometry/generate-projection';
	import { superConfigStore, superGlobuleStore } from '$lib/stores';
	import LabeledControl from './LabeledControl.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import { polyhedronConfigs } from '$lib/projection-geometry/polyhedra-configs';
	import type { SurfaceConfig } from '$lib/projection-geometry/types';
	import PointInput from '../../controls/super-control/PointInput.svelte';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';

	export let editCurve = true;
	export let sectionIndex = 0;


	const handleChangePolyhedron = (event: Event) => {
		const selectedName = (event.target as HTMLSelectElement).value;
		const newPolyhedron = polyhedronConfigs.find((p) => p.name === selectedName);
		console.debug('newPolyhedron', { newPolyhedron, selectedName, event });
		if (newPolyhedron) {
			$superConfigStore.projectionConfigs[0].projectorConfig.polyhedron = newPolyhedron as any;
			$superConfigStore = $superConfigStore;
		}
	};

	console.debug($superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.name);

	$: surfaceConfig = $superConfigStore.projectionConfigs[0].surfaceConfig as SurfaceConfig;
</script>

<Editor>
	<section>
		<header>
			{`${surfaceConfig.type} Transform: ${surfaceConfig.transform}`}
		</header>
		<Container direction="column">
			<LabeledControl label="Translate" show={surfaceConfig.transform !== 'inherit'}>
				{#if $superConfigStore.projectionConfigs[0].surfaceConfig.transform !== 'inherit'}
				  <PointInput bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.transform.translate} />
				{/if}
			</LabeledControl>

			<LabeledControl label="Scale" show={surfaceConfig.transform !== 'inherit'}>
				{#if $superConfigStore.projectionConfigs[0].surfaceConfig.transform !== 'inherit'}
				  <PointInput bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.transform.scale} />
				{/if}
			</LabeledControl>

			{#if surfaceConfig.type === 'SphereConfig'}
				<LabeledControl label="Sphere Radius" >
					<NumberInput bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.radius} hasButtons/>
				</LabeledControl>
				<LabeledControl label="Sphere Center" >
					<PointInput bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.center}/>
				</LabeledControl>
			{/if}
		</Container>
	</section>
</Editor>

<style>
	select {
		border: none;
		background-color: transparent;
		font-size: 1.2rem;
		font-weight: bold;
		color: black;
		width: 100%;
	}
	option {
		background-color: white;
	}
</style>
