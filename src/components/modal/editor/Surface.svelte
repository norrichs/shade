<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import LabeledControl from './LabeledControl.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import type { SurfaceConfig } from '$lib/projection-geometry/types';
	import PointInput from '../../controls/super-control/PointInput.svelte';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import {
		defaultCapsuleConfig,
		defaultSphereConfig
	} from '$lib/projection-geometry/surface-definitions';
	import { generateDefaultGlobuleConfig } from '$lib/shades-config';

	const handleChangeSurfaceType = (event: Event) => {
		const selectedType = (event.target as HTMLSelectElement).value;
		console.debug('handleChangeSurfaceType', selectedType);
		let newSurfaceConfig: SurfaceConfig;
		switch (selectedType) {
			case 'sphere':
				newSurfaceConfig = { ...defaultSphereConfig, transform: 'inherit' };
				break;
			case 'capsule':
				newSurfaceConfig = { ...defaultCapsuleConfig, transform: 'inherit' };
				break;
			case 'globule':
			default:
				newSurfaceConfig = { ...$superConfigStore.subGlobuleConfigs[0].globuleConfig, transform: 'inherit' };
				break;
		}
		console.debug('newSurfaceConfig', newSurfaceConfig);
		$superConfigStore.projectionConfigs[0].surfaceConfig = { ...newSurfaceConfig };
		$superConfigStore = $superConfigStore;
		console.debug('superConfigStore', $superConfigStore.projectionConfigs[0].surfaceConfig);
	};

	$: surfaceConfig = $superConfigStore.projectionConfigs[0].surfaceConfig as SurfaceConfig;
</script>

<Editor>
	<section>
		<header>
			{`${surfaceConfig.type} Transform: ${surfaceConfig.transform}`}
		</header>
		<Container direction="column">
			<LabeledControl label="Surface Type">
				<select on:change={handleChangeSurfaceType}>
					<option value="sphere">Sphere</option>
					<option value="capsule">Capsule</option>
					<option value="globule">Globule</option>
				</select>
			</LabeledControl>
			<LabeledControl label="Translate" show={surfaceConfig.transform !== 'inherit'}>
				{#if $superConfigStore.projectionConfigs[0].surfaceConfig.transform !== 'inherit'}
					<PointInput
						bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.transform.translate}
					/>
				{/if}
			</LabeledControl>

			<LabeledControl label="Scale" show={surfaceConfig.transform !== 'inherit'}>
				{#if $superConfigStore.projectionConfigs[0].surfaceConfig.transform !== 'inherit'}
					<PointInput
						bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.transform.scale}
					/>
				{/if}
			</LabeledControl>

			{#if surfaceConfig.type === 'SphereConfig'}
				<LabeledControl label="Sphere Radius">
					<NumberInput
						bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.radius}
						hasButtons
					/>
				</LabeledControl>
				<LabeledControl label="Sphere Center">
					<PointInput bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.center} />
				</LabeledControl>
			{/if}
		</Container>
	</section>
</Editor>

<style>
</style>
