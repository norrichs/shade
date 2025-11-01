<script lang="ts">
	import { getCrossSectionPath } from '$lib/projection-geometry/generate-projection';

	import type {
		CrossSectionConfig,
		ProjectionCurveSampleMethod
	} from '$lib/projection-geometry/types';
	import { superConfigStore, superGlobuleStore } from '$lib/stores';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Button from '../../design-system/Button.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import { endPointsInRange, endPointsZeroX, insertPoint, neighborPointMatch } from './path-editor';
	import PathEditor from './PathEditor.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import { polyhedronConfigs } from '$lib/projection-geometry/polyhedra-configs';

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

	$: crossSectionPath = getCrossSectionPath(
		{ projection: 0, tube: 0 },
		$superGlobuleStore.projections,
		sectionIndex
	);
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
					on:change={handleChangePolyhedron}
				>
					{#each polyhedronConfigs as polyhedron}
						<option value={polyhedron.name}>{polyhedron.name}</option>
					{/each}
				</select>
			</LabeledControl>
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
