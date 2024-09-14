<script lang="ts">
	import { generateGlobuleData } from '$lib/generate-shape';
	import type { GlobuleConfig, Globule, GlobuleGeometry, Id, SuperGlobuleConfig } from '$lib/types';
	import GlobuleTile2 from '../../components/globule-tile/GlobuleTile2.svelte';
	import { configStore0 } from '$lib/stores/stores';
	import { superConfigStore } from '$lib/stores';
	import {
		generateDefaultGlobuleConfig,
		generateDefaultSuperGlobuleConfig,
		generateSubGlobuleConfigWrapper,
		generateSuperGlobuleConfigWrapper
	} from '$lib/shades-config';
	import type { PageData } from '../$types';
	import { invalidateAll } from '$app/navigation';
	import { generateGlobuleGeometry } from '$lib/generate-globulegeometry';
	import { generateTempId } from '$lib/id-handler';

	// let globules: Globule[];
	let globuleGeometries: GlobuleGeometry[];

	export let data: PageData & { globuleConfigs: GlobuleConfig[] };

	const refreshGlobules = (globuleConfigs: GlobuleConfig[]) => {
		const defaultConfig = generateDefaultGlobuleConfig();

		const mergedGlobuleConfigs = globuleConfigs.map((gc) => {
			return {
				...defaultConfig,
				...gc
			};
		});

		globuleGeometries = [...mergedGlobuleConfigs].map((config, i) => {
			const data = generateGlobuleData(config);
			const geometry = generateGlobuleGeometry({
				type: 'Globule',
				subGlobuleConfigId: generateTempId('sub'),
				globuleConfigId: config.id,
				name: config.name,
				recurrence: 1,
				data
			});
			console.debug(i, 'refreshGlobules', { geometry });
			return geometry;
		});
	};

	const handleDelete = async (id: number) => {
		const response: Response = await fetch(`/api/globuleConfig/${id}`, {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' }
		});
		invalidateAll();
		return response;
	};

	const handleLoad = (id: Id, addToExisting: boolean) => {
		console.debug('LOAD', id, data.globuleConfigs);
		const globuleConfig = data.globuleConfigs.find((cfg) => id === cfg.id);

		if (globuleConfig && addToExisting) {
			$superConfigStore.subGlobuleConfigs.push(generateSubGlobuleConfigWrapper(globuleConfig));
		}
		if (globuleConfig && !addToExisting) {
			superConfigStore.set(generateSuperGlobuleConfigWrapper(globuleConfig));
		}
	};

	$: refreshGlobules(data.globuleConfigs);
</script>

<main>
	<section>
		{#if globuleGeometries}
			<h1>Globules</h1>
			<div class="globule-gallery">
				{#each globuleGeometries as globuleGeometry}
					<GlobuleTile2 {globuleGeometry} size={300} onDelete={handleDelete} onLoad={handleLoad} />
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
