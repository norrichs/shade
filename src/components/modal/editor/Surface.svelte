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
				newSurfaceConfig = {
					...$superConfigStore.subGlobuleConfigs[0].globuleConfig,
					transform: {
						translate: { x: 0, y: 0, z: 0 },
						scale: { x: 1, y: 1, z: 1 },
						rotate: { x: 0, y: 0, z: 0 }
					}
				} as SurfaceConfig;
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

			{#if surfaceConfig.type === 'SphereConfig' && 'radius' in surfaceConfig}
				<LabeledControl label="Sphere Radius">
					<NumberInput bind:value={surfaceConfig.radius} hasButtons />
				</LabeledControl>
				<LabeledControl label="Sphere Center">
					<PointInput bind:value={surfaceConfig.center} />
				</LabeledControl>
			{/if}

			{#if surfaceConfig.type === 'GlobuleConfig' && 'endCaps' in surfaceConfig && surfaceConfig.endCaps}
				<LabeledControl label="End Caps">
					<label>
						<input
							type="checkbox"
							checked={surfaceConfig.endCaps.enabled}
							on:change={(e) => {
								if (surfaceConfig.type === 'GlobuleConfig' && surfaceConfig.endCaps) {
									surfaceConfig.endCaps.enabled = e.currentTarget.checked;
									$superConfigStore = $superConfigStore;
								}
							}}
						/>
						Enable (prevents intersection errors)
					</label>
				</LabeledControl>

				{#if surfaceConfig.endCaps.enabled}
					<LabeledControl label="Top Cap">
						<input
							type="checkbox"
							checked={surfaceConfig.endCaps.topCap}
							on:change={(e) => {
								if (surfaceConfig.type === 'GlobuleConfig' && surfaceConfig.endCaps) {
									surfaceConfig.endCaps.topCap = e.currentTarget.checked;
									$superConfigStore = $superConfigStore;
								}
							}}
						/>
					</LabeledControl>

					<LabeledControl label="Bottom Cap">
						<input
							type="checkbox"
							checked={surfaceConfig.endCaps.bottomCap}
							on:change={(e) => {
								if (surfaceConfig.type === 'GlobuleConfig' && surfaceConfig.endCaps) {
									surfaceConfig.endCaps.bottomCap = e.currentTarget.checked;
									$superConfigStore = $superConfigStore;
								}
							}}
						/>
					</LabeledControl>

					<LabeledControl label="Cap Offset">
						<NumberInput
							value={surfaceConfig.endCaps.capOffset ?? 0}
							on:change={(e) => {
								if (surfaceConfig.type === 'GlobuleConfig' && surfaceConfig.endCaps) {
									surfaceConfig.endCaps.capOffset = e.detail;
									$superConfigStore = $superConfigStore;
								}
							}}
							step={0.1}
						/>
					</LabeledControl>
				{/if}
			{/if}
		</Container>
	</section>
</Editor>

<style>
</style>
