<script lang="ts">
	import { Canvas, OrbitControls, T } from '@threlte/core';
	import { degToRad } from 'three/src/math/MathUtils';
	import StrutMesh from '../strut/StrutMesh.svelte';
	import type { Level, Band, Strut, GlobuleConfig } from '$lib/types';
	import { getRenderable } from '$lib/generate-shape';
	import LevelMesh from '../level/LevelMesh.svelte';
	import RotatedShapeBandMesh from '../band/BandMesh.svelte';
	import { config } from '$lib/stores';
	import type { GlobuleData } from './seed';
	import GlobuleTileContainer from './GlobuleTileContainer.svelte';
	import { goto } from '$app/navigation';

	export let size: number = 200;
	export let data: GlobuleData;
	export let name: string;
	export let globuleConfigId: string;
	export let onDelete: (id: number) => Promise<Response>;
	export let onLoad: (id: number) => void;

	let { levels, bands, struts } = data;

	let displayBands: Band[];
	let displayStruts: Strut[];
	let displayLevels: Level[];

	$: {
		displayBands = getRenderable($config.renderConfig, bands) as Band[];
	}
	$: {
		if (struts && struts.length > 0) {
			displayStruts = getRenderable($config.renderConfig, struts) as Strut[];
		}
	}
	$: {
		if (levels && levels.length > 0) {
			displayLevels = getRenderable($config.renderConfig, levels) as Level[];
		}
	}
</script>

<GlobuleTileContainer name={name || ''} id={globuleConfigId || ''} {size}>
	<button
		on:click={() => {
			onLoad(Number.parseInt(globuleConfigId)), goto('/designer');
		}}>Load into Designer</button
	>
	<button on:click={() => onDelete(Number.parseInt(globuleConfigId))}>Delete</button>
	<Canvas slot="globule-tile-3d">
		<T.PerspectiveCamera makeDefault position={[0, 400, -5]} fov={50}>
			<OrbitControls maxPolarAngle={degToRad(160)} enableZoom={false} target={{ y: 0.5 }} />
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
			<!-- {#if $config.renderConfig?.show?.struts}
						{#each displayStruts as strut}
							<StrutMesh {strut} showTabs={false} />
						{/each}
					{/if} -->
		</T.Group>
	</Canvas>
</GlobuleTileContainer>
