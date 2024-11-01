<script lang="ts">
	import { generateGlobuleData } from '$lib/generate-shape';
	import type {
		GlobuleConfig,
		Globule,
		GlobuleGeometry,
		Id,
		SuperGlobuleConfig,
		SuperGlobuleGeometry,
		GlobuleConfigType
	} from '$lib/types';
	import GlobuleTile2 from '../../components/globule-tile/GlobuleTile2.svelte';
	import { superConfigStore } from '$lib/stores';
	import {
		generateDefaultGlobuleConfig,
		generateDefaultSuperGlobuleConfig,
		generateSubGlobuleConfigWrapper,
		generateSuperGlobuleConfigWrapper
	} from '$lib/shades-config';
	import type { PageData } from '../$types';
	import { invalidateAll } from '$app/navigation';
	import {
		generateGlobuleGeometry,
		generateSuperGlobuleGeometry
	} from '$lib/generate-globulegeometry';
	import { generateTempId } from '$lib/id-handler';
	import type { TransitionalSuperGlobuleConfig } from '../api/globuleConfig/utils';
	import { generateSuperGlobule } from '$lib/generate-superglobule';
	import SuperGlobuleTile from '../../components/globule-tile/SuperGlobuleTile.svelte';

	// let globules: Globule[];
	let globuleGeometries: GlobuleGeometry[];
	let superGlobuleGeometries: SuperGlobuleGeometry[];

	export let data: PageData & {
		globuleConfigs: GlobuleConfig[];
		superGlobuleConfigs: TransitionalSuperGlobuleConfig[];
	};

	const refreshGeometry = ({
		globuleConfigs,
		superGlobuleConfigs
	}: PageData & {
		globuleConfigs: GlobuleConfig[];
		superGlobuleConfigs: TransitionalSuperGlobuleConfig[];
	}) => {
		console.debug('refresh Geometry', { globuleConfigs, superGlobuleConfigs });
		const hydrated = superGlobuleConfigs.map((superGC) => hydrateSuper(superGC, globuleConfigs));
		refreshSuperGlobules(hydrated);
		refreshGlobules(globuleConfigs);
	};

	const refreshSuperGlobules = (superGlobuleConfigs: SuperGlobuleConfig[]) => {
		const data = superGlobuleConfigs.map((superGlobuleConfig) =>
			generateSuperGlobule(superGlobuleConfig)
		);
		const geometry = data.map((superGlobule) => generateSuperGlobuleGeometry(superGlobule));
		superGlobuleGeometries = geometry;
	};

	const hydrateSuper = (
		superGlobuleConfig: TransitionalSuperGlobuleConfig,
		globuleConfigs: GlobuleConfig[]
	): SuperGlobuleConfig => {
		return {
			...superGlobuleConfig,
			subGlobuleConfigs: superGlobuleConfig.subGlobuleConfigs.map((subGC) => {
				const globuleConfig = globuleConfigs.find((gc) => {
					return gc.id === subGC.globuleConfigId;
				});
				if (!globuleConfig) {
					throw new Error(`missing globule config ${subGC.globuleConfigId}`);
				}
				return { ...subGC, globuleConfig };
			})
		};
	};

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

	const handleDeleteGlobule = async (id: number) => {
		const response: Response = await fetch(`/api/globuleConfig/${id}`, {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' }
		});
		invalidateAll();
		return response;
	};
	const handleDeleteSuperGlobule = async (id: number) => {
		const response: Response = await fetch(`/api/superGlobuleConfig/${id}`, {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' }
		});
		invalidateAll();
		return response;
	};
	const handleLoadGlobule = (id: Id, addToExisting: boolean) => {
		const config = data.globuleConfigs.find((cfg) => id === cfg.id);

		if (config && addToExisting) {
			$superConfigStore.subGlobuleConfigs.push(generateSubGlobuleConfigWrapper(config));
		}
		if (config && !addToExisting) {
			superConfigStore.set(generateSuperGlobuleConfigWrapper(config));
		}
	};

	const handleLoadSuperGlobule = (id: Id, addToExisting: boolean) => {
		const config = data.superGlobuleConfigs.find((cfg) => id === cfg.id);
		if (!config) return
		const hydrated = hydrateSuper(config, data.globuleConfigs);

		if (addToExisting) {
			$superConfigStore.subGlobuleConfigs.push(...hydrated.subGlobuleConfigs);
		}
		if (!addToExisting) {
			superConfigStore.set(hydrated);
		}
	};

	$: refreshGeometry(data);
</script>

<main>
	<section>
		{#if globuleGeometries}
			<h1>Globules</h1>
			<div class="globule-gallery">
				{#each globuleGeometries as globuleGeometry}
					<GlobuleTile2 {globuleGeometry} size={300} onDelete={handleDeleteGlobule} onLoad={handleLoadGlobule} />
				{/each}
			</div>
			{#if data.superGlobuleConfigs}
				<h1>SuperGlobules</h1>
				<div class="globule-gallery">
					{#each superGlobuleGeometries as superGlobuleGeometry}
						<SuperGlobuleTile
							{superGlobuleGeometry}
							size={300}
							onDelete={handleDeleteSuperGlobule}
							onLoad={handleLoadSuperGlobule}
						/>

						<!-- <div class="super-globule-config-tile">
							<div>{cfg.name}</div>
							<div>{cfg.id}</div>
							<div>{cfg.subGlobuleConfigs.length}</div>
							<button>Load SuperGlobule</button>
						</div> -->
					{/each}
				</div>
			{/if}
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
	.super-globule-config-tile {
		display: flex;
		flex-direction: column;
		width: 300px;
		height: 300px;
	}
</style>
