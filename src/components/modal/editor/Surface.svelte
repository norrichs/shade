<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import { get } from 'svelte/store';
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
		const config = get(superConfigStore);
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
					...config.subGlobuleConfigs[0].globuleConfig,
					transform: {
						translate: { x: 0, y: 0, z: 0 },
						scale: { x: 1, y: 1, z: 1 },
						rotate: { x: 0, y: 0, z: 0 }
					}
				} as SurfaceConfig;
				break;
		}
		config.projectionConfigs[0].surfaceConfig = { ...newSurfaceConfig };
		superConfigStore.set(config);
	};

	let surfaceConfig = $derived($superConfigStore.projectionConfigs[0].surfaceConfig as SurfaceConfig);
	let surfaceTypeValue = $derived(surfaceConfig.type.replace('Config', '').toLowerCase());
</script>

<Editor>
	<section>
		<header>
			{`${surfaceConfig.type} Transform: ${surfaceConfig.transform}`}
		</header>
		<Container direction="column">
			<LabeledControl label="Surface Type">
				<select value={surfaceTypeValue} onchange={handleChangeSurfaceType}>
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
					<NumberInput
						value={surfaceConfig.radius}
						hasButtons
						onChange={(v) => {
							const config = get(superConfigStore);
							(config.projectionConfigs[0].surfaceConfig as any).radius = v;
							superConfigStore.set(config);
						}}
					/>
				</LabeledControl>
				<LabeledControl label="Sphere Center">
					<PointInput bind:value={$superConfigStore.projectionConfigs[0].surfaceConfig.center} />
				</LabeledControl>
			{/if}

			{#if surfaceConfig.type === 'GlobuleConfig' && 'endCaps' in surfaceConfig && surfaceConfig.endCaps}
				<LabeledControl label="End Caps">
					<label>
						<input
							type="checkbox"
							checked={surfaceConfig.endCaps.enabled}
							onchange={(e) => {
								if (surfaceConfig.type === 'GlobuleConfig' && surfaceConfig.endCaps) {
									surfaceConfig.endCaps.enabled = e.currentTarget.checked;
									superConfigStore.set(get(superConfigStore));
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
							onchange={(e) => {
								if (surfaceConfig.type === 'GlobuleConfig' && surfaceConfig.endCaps) {
									surfaceConfig.endCaps.topCap = e.currentTarget.checked;
									superConfigStore.set(get(superConfigStore));
								}
							}}
						/>
					</LabeledControl>

					<LabeledControl label="Bottom Cap">
						<input
							type="checkbox"
							checked={surfaceConfig.endCaps.bottomCap}
							onchange={(e) => {
								if (surfaceConfig.type === 'GlobuleConfig' && surfaceConfig.endCaps) {
									surfaceConfig.endCaps.bottomCap = e.currentTarget.checked;
									superConfigStore.set(get(superConfigStore));
								}
							}}
						/>
					</LabeledControl>

					<LabeledControl label="Cap Offset">
						<NumberInput
							value={surfaceConfig.endCaps.capOffset ?? 0}
							onChange={(newValue) => {
								if (surfaceConfig.type === 'GlobuleConfig' && surfaceConfig.endCaps) {
									surfaceConfig.endCaps.capOffset = newValue;
									superConfigStore.set(get(superConfigStore));
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
