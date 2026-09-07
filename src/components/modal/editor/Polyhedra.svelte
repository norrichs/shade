<script lang="ts">
	import { getCrossSectionPath } from '$lib/projection-geometry/generate-projection';

	import { superConfigStore, superGlobuleStore } from '$lib/stores';
	import { get } from 'svelte/store';
	import LabeledControl from './LabeledControl.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import { polyhedronConfigs } from './polyhedra-configs';
	import TransformControls from './TransformControls.svelte';
	import { identityTransform, isInheritedTransform } from './transform-config';

	const handleChangePolyhedron = (event: Event) => {
		const selectedName = (event.target as HTMLSelectElement).value;
		const newPolyhedron = polyhedronConfigs.find((p) => p.name === selectedName);

		if (newPolyhedron) {
			const config = get(superConfigStore);
			// Every polyhedron model ships `transform: 'inherit'`, which resolves to a
			// hardcoded identity with no editor anywhere — so the polyhedron transform
			// was unreachable, exactly as the surface transform was. Materialise on
			// selection so the controls below have something to bind to; identity seed
			// means nothing moves. See ./transform-config.
			config.projectionConfigs[0].projectorConfig.polyhedron = {
				...(newPolyhedron as any),
				transform: identityTransform()
			};
			superConfigStore.set(config);
		}
	};

	// Same materialisation for the polyhedron already in the config (a fresh app
	// load, or any saved config predating this). No-op after the first run.
	$effect(() => {
		const polyhedron = $superConfigStore.projectionConfigs[0]?.projectorConfig?.polyhedron;
		if (!polyhedron || !isInheritedTransform(polyhedron.transform)) return;
		const config = get(superConfigStore);
		config.projectionConfigs[0].projectorConfig.polyhedron = {
			...config.projectionConfigs[0].projectorConfig.polyhedron,
			transform: identityTransform()
		};
		superConfigStore.set(config);
	});
</script>

<Editor>
	<section>
		<header>
			{$superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.name}
		</header>
		<Container direction="column">
			<LabeledControl label="Polyhedron:">
				<select
					value={$superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.name}
					onchange={handleChangePolyhedron}
				>
					{#each polyhedronConfigs as polyhedron}
						<option value={polyhedron.name}>{polyhedron.name}</option>
					{/each}
				</select>
			</LabeledControl>
			{#if $superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.transform !== 'inherit'}
				<TransformControls
					bind:transform={
						$superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.transform
					}
				/>
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
