<script lang="ts">
	import { generateRotatedShapeGeometry } from '$lib/generate-shape';
	import type { ShadesConfig } from '$lib/types';
	import type { Globule } from '../../components/globule-tile/seed';
	import GlobuleTile from '../../components/globule-tile/GlobuleTile.svelte';
	import { config0 } from '$lib/stores';
	import { generateDefaultConfig } from '$lib/shades-config';

	let globuleConfigData: ShadesConfig[];
	let globules: Globule[];

	const handleRead = async () => {
		const response: Response = await fetch('/api/globuleConfig', {
			method: 'GET',
			headers: { 'content-type': 'application/json' }
		});

		let result = await response.json();
		// result = result.map(cfg=>{
		// 	return {...cfg, silhouetteConfig: deserializeSilhouetteConfig()}
		// })

		console.dir(result, { depth: 4 });
		globuleConfigData = result;
		refreshGlobules(globuleConfigData);
	};

	const refreshGlobules = (globuleConfigs: ShadesConfig[]) => {
		console.debug('COMPARE');
		console.debug('main', $config0);
		console.debug('stored', globuleConfigs);

		const defaultConfig = generateDefaultConfig()

		const mergedGlobuleConfigs = globuleConfigs.map(gc => {
			return {
				...defaultConfig,
				...gc,
			}
		})
		console.debug("merged", mergedGlobuleConfigs)


		globules = [...mergedGlobuleConfigs].map((config) => {
			return {
				name: '',
				data: generateRotatedShapeGeometry(config)
			};
		});
	};
</script>

<main>
	<header>
		<h1>Gallery</h1>
	</header>
	<button on:click={handleRead}>Read</button>
	<section>
		{#if globules}
			<div>
				{#each globules as globule}
					<GlobuleTile name={globule.name} data={globule.data} />
				{/each}
			</div>
		{/if}
	</section>
</main>
