<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import LabeledControl from './LabeledControl.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import type { SurfaceConfig } from '$lib/projection-geometry/types';
	import PointInput from '../../controls/super-control/PointInput.svelte';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';

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
