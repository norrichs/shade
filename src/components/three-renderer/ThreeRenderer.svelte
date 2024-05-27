<script lang="ts">
	import { Canvas, OrbitControls, T } from '@threlte/core';
	import { degToRad } from 'three/src/math/MathUtils';
	import StrutMesh from '../../components/strut/StrutMesh.svelte';
	import type { Level, Band, Strut } from '$lib/types';
	import { getRenderable } from '$lib/generate-shape';
	import LevelMesh from '../level/LevelMesh.svelte';
	import RotatedShapeBandMesh from '../band/BandMesh.svelte';
	import { config } from '$lib/stores';

	export let levels: Level[] = [];
	export let bands: Band[] = [];
	export let struts: Strut[] = [];

	let displayBands: Band[];
	let displayStruts: Strut[];
	let displayLevels: Level[];

	$: {
		displayBands = getRenderable($config.renderConfig, bands) as Band[];
	}
	$: {
		if (struts.length > 0) {
			displayStruts = getRenderable($config.renderConfig, struts) as Strut[];
		}
	}
	$: {
		if (levels.length > 0) {
			displayLevels = getRenderable($config.renderConfig, levels) as Level[];
		}
	}
</script>

<div>last vertex</div>
<Canvas>
	<T.PerspectiveCamera makeDefault position={[0, 600, -5]} fov={50}>
		<OrbitControls maxPolarAngle={degToRad(160)} enableZoom={true} target={{ y: 0.5 }} />
	</T.PerspectiveCamera>

	<T.DirectionalLight castShadow position={[3, 10, 10]} />
	<T.DirectionalLight position={[-3, 10, -10]} intensity={0.5} />
	<T.AmbientLight intensity={0.2} />

	<T.Group position={[0, 0, 0]}>
		{#if $config.renderConfig?.show?.levels}
			{#each displayLevels as level}
				<LevelMesh {level} />
			{/each}
		{/if}

		{#if $config.renderConfig?.show?.bands}
			{#each displayBands as band, i}
				<RotatedShapeBandMesh {band} showTabs={$config.renderConfig?.show?.tabs} />
			{/each}
		{/if}
		{#if $config.renderConfig?.show?.struts}
			{#each displayStruts as strut}
				<StrutMesh {strut} showTabs={false} />
			{/each}
		{/if}
	</T.Group>
</Canvas>
