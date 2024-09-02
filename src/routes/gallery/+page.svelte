<script lang="ts">
	import { generateRotatedShapeGeometry } from '$lib/generate-shape';
	import type { GlobuleConfig } from '$lib/types';
	import type { Globule } from '../../components/globule-tile/seed';
	import GlobuleTile from '../../components/globule-tile/GlobuleTile.svelte';
	import { config0 } from '$lib/stores';
	import { generateDefaultConfig } from '$lib/shades-config';
	import type { PageData } from '../$types';

	// let globuleConfigData: GlobuleConfig[];
	let globules: Globule[];
	export let data: PageData & { globuleConfigs: GlobuleConfig[] };

	const refreshGlobules = (globuleConfigs: GlobuleConfig[]) => {
		const defaultConfig = generateDefaultConfig();

		const mergedGlobuleConfigs = globuleConfigs.map((gc) => {
			return {
				...defaultConfig,
				...gc
			};
		});

		globules = [...mergedGlobuleConfigs].map((config) => {
			return {
				name: config.name || '--',
				globuleConfigId: config.id || '--',
				data: generateRotatedShapeGeometry(config)
			};
		});
	};

	$: refreshGlobules(data.globuleConfigs);
</script>

<main>
	<header>
		<h1>Gallery</h1>
	</header>
	<!-- <button on:click={handleRead}>Read</button> -->
	<section>
		{#if globules}
			<div class="globule-gallery">
				{#each globules as globule}
					<GlobuleTile
						data={globule.data}
						name={globule.name}
						globuleConfigId={globule.globuleConfigId}
					/>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	.globule-gallery {
		display: flex;
		flex-direction: row;
		justify-content: center;
		gap: 8px;
	}
</style>
