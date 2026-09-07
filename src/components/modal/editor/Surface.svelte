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
	import TransformControls from './TransformControls.svelte';
	import { identityTransform, isInheritedTransform } from './transform-config';

	const handleChangeSurfaceType = (event: Event) => {
		const selectedType = (event.target as HTMLSelectElement).value;
		const config = get(superConfigStore);
		let newSurfaceConfig: SurfaceConfig;
		// Every surface type gets its own concrete transform. Sphere and Capsule
		// used to be seeded 'inherit', which resolves to a hardcoded identity with
		// no editor anywhere — so they had no Translate/Scale controls at all,
		// while Globule did. See ./transform-config.
		switch (selectedType) {
			case 'sphere':
				newSurfaceConfig = { ...defaultSphereConfig, transform: identityTransform() };
				break;
			case 'capsule':
				newSurfaceConfig = { ...defaultCapsuleConfig, transform: identityTransform() };
				break;
			case 'globule':
			default:
				newSurfaceConfig = {
					...config.subGlobuleConfigs[0].globuleConfig,
					transform: identityTransform()
				} as SurfaceConfig;
				break;
		}
		config.projectionConfigs[0].surfaceConfig = { ...newSurfaceConfig };
		superConfigStore.set(config);
	};

	let surfaceConfig = $derived(
		$superConfigStore.projectionConfigs[0].surfaceConfig as SurfaceConfig
	);
	let surfaceTypeValue = $derived(surfaceConfig.type.replace('Config', '').toLowerCase());

	// Configs saved before every surface type carried its own transform still hold
	// 'inherit'. Materialise once so the controls below have something to bind to;
	// the seed is the same identity 'inherit' resolved to, so nothing moves. The
	// guard makes this a no-op on every run after the first.
	$effect(() => {
		const surface = $superConfigStore.projectionConfigs[0]?.surfaceConfig;
		if (!surface || !isInheritedTransform(surface.transform)) return;
		const config = get(superConfigStore);
		config.projectionConfigs[0].surfaceConfig = {
			...config.projectionConfigs[0].surfaceConfig,
			transform: identityTransform()
		} as SurfaceConfig;
		superConfigStore.set(config);
	});
</script>

<Editor>
	<section>
		<!-- The transform used to be the string 'inherit' and was interpolated here;
		     now that every surface carries a real transform object that rendered as
		     "[object Object]". The values themselves are editable below. -->
		<header>
			{surfaceConfig.type}
		</header>
		<Container direction="column">
			<LabeledControl label="Surface Type">
				<select value={surfaceTypeValue} onchange={handleChangeSurfaceType}>
					<option value="sphere">Sphere</option>
					<option value="capsule">Capsule</option>
					<option value="globule">Globule</option>
				</select>
			</LabeledControl>
			{#if $superConfigStore.projectionConfigs[0].surfaceConfig.transform !== 'inherit'}
				<TransformControls
					bind:transform={$superConfigStore.projectionConfigs[0].surfaceConfig.transform}
				/>
			{/if}

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
