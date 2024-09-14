<script lang="ts">
	import { T } from '@threlte/core';
	import StrutMesh from '../../components/strut/StrutMesh.svelte';
	import type { Level, Band, Strut } from '$lib/types';
	import { getRenderable } from '$lib/generate-shape';
	import LevelMesh from '../level/LevelMesh.svelte';
	import BandMesh from '../band/BandMesh.svelte';
	import { configStore } from '$lib/stores/stores';
	import { interactivity, OrbitControls } from '@threlte/extras';
	import { degToRad } from '$lib/patterns/utils';
	import { DoubleSide, MeshPhysicalMaterial } from 'three';

	export let levels: Level[] = [];
	export let bands: Band[] = [];
	export let struts: Strut[] = [];

	console.debug('ThreeRenderer', { levels, bands, struts });

	interactivity();

	let displayBands: Band[];
	let displayStruts: Strut[];
	let displayLevels: Level[];

	$: {
		displayBands = getRenderable($configStore.renderConfig, bands) as Band[];
	}
	$: {
		if (struts.length > 0) {
			displayStruts = getRenderable($configStore.renderConfig, struts) as Strut[];
		}
	}
	$: {
		if (levels.length > 0) {
			displayLevels = getRenderable($configStore.renderConfig, levels) as Level[];
		}
	}

	// let clickEvents = [];

	const handleClick = (event) => {
		event.stopPropagation();
		console.debug('click', event);
		selectedMaterial = selectedMaterial + 1;
	};

	const materials = ['red', 'green', 'blue', "purple", "gray", "yellow"].map(
		(color) =>
			new MeshPhysicalMaterial({
				color,
				transparent: true,
				opacity: 0.95,
				clearcoat: 1,
				clearcoatRoughness: 0,
				side: DoubleSide
			})
	);
	let selectedMaterial = 0;
</script>

<T.PerspectiveCamera makeDefault position={[0, 600, -5]} fov={50}>
	<OrbitControls maxPolarAngle={degToRad(160)} enableZoom={true} target={[0, 0.5, 0]} />
</T.PerspectiveCamera>

<T.DirectionalLight castShadow position={[3, 10, 10]} />
<T.DirectionalLight position={[-3, 10, -10]} intensity={0.8} />
<T.AmbientLight intensity={0.8} />

<T.Group position={[0, 0, 0]} on:click={handleClick}>
	{#if $configStore.renderConfig?.show?.levels && displayLevels}
		{#each displayLevels as level}
			<LevelMesh {level} />
		{/each}
	{/if}

	{#if $configStore.renderConfig?.show?.bands && displayBands}
		{#each displayBands as band, i}
			<T.Group>
				<BandMesh
					material={materials[selectedMaterial % materials.length]}
					{band}
					showTabs={$configStore.renderConfig?.show?.tabs}
				/>
			</T.Group>
		{/each}
	{/if}
	{#if $configStore.renderConfig?.show?.struts && displayStruts}
		{#each displayStruts as strut}
			<StrutMesh {strut} showTabs={false} />
		{/each}
	{/if}
</T.Group>
