<script lang="ts">
	import { generateGlobuleData } from '$lib/generate-shape';
	import { FiChevronLeft, FiChevronRight } from 'svelte-icons-pack/fi';
	import type {
		GlobuleConfig,
		GlobuleGeometry,
		Id,
		SuperGlobuleConfig,
		SuperGlobuleGeometry,
	} from '$lib/types';
	import GlobuleTile2 from '../../components/globule-tile/GlobuleTile2.svelte';
	import { superConfigStore } from '$lib/stores';
	import {
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
	import { Icon } from 'svelte-icons-pack';

	const VIEW_TILE_PAGE_SIZE = 4;
	let globuleGeometries: GlobuleGeometry[];
	let superGlobuleGeometries: SuperGlobuleGeometry[];
	let globuleStartIndex = 0;
	let superGlobuleStartIndex = 0;

	export let data: PageData & {
		globuleConfigs: GlobuleConfig[];
		superGlobuleConfigs: TransitionalSuperGlobuleConfig[];
	};
	const handleRepage = (
		target: 'globules' | 'superGlobules',
		action: 'increment' | 'decrement'
	) => {
		if (target === 'globules') {
			if (action === 'increment') {
				globuleStartIndex = Math.min(
					globuleStartIndex + VIEW_TILE_PAGE_SIZE,
					data.globuleConfigs.length - VIEW_TILE_PAGE_SIZE
				);
			} else {
				globuleStartIndex = Math.max(globuleStartIndex - VIEW_TILE_PAGE_SIZE, 0);
			}
		}
		if (target === 'superGlobules') {
			if (action === 'increment') {
				superGlobuleStartIndex = Math.min(
					superGlobuleStartIndex + VIEW_TILE_PAGE_SIZE,
					data.superGlobuleConfigs.length - VIEW_TILE_PAGE_SIZE
				);
			} else {
				superGlobuleStartIndex = Math.max(superGlobuleStartIndex - VIEW_TILE_PAGE_SIZE, 0);
			}
		}
		console.debug('handleRepage', target, action, { globuleStartIndex, superGlobuleStartIndex });
		refreshGeometry(data);
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
		const visibleSuperGlobules = superGlobuleConfigs.slice(
			superGlobuleStartIndex,
			superGlobuleStartIndex + VIEW_TILE_PAGE_SIZE
		);
		const data = visibleSuperGlobules.map((superGlobuleConfig) =>
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
		const visibleGlobules = globuleConfigs.slice(
			globuleStartIndex,
			globuleStartIndex + VIEW_TILE_PAGE_SIZE
		);
		console.debug('refreshGlobules', globuleStartIndex, VIEW_TILE_PAGE_SIZE, {
			globuleConfigs,
			visibleGlobules
		});
		console.debug(
			'globule ids',
			visibleGlobules.map((cfg) => cfg.id)
		);

		globuleGeometries = visibleGlobules.map((config, i) => {
			const data = generateGlobuleData(config);
			const geometry = generateGlobuleGeometry({
				type: 'Globule',
				subGlobuleConfigId: generateTempId('sub'),
				globuleConfigId: config.id,
				name: config.name,
				recurrence: 1,
				data
			});
			console.debug(i, 'refreshGlobules', geometry.globuleConfigId);
			return geometry;
		});
		console.debug('newGlobuleGeometries', globuleGeometries);
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
		console.debug('handleLoadGlobule', { id, addToExisting });
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
		if (!config) return;
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
				<button on:click={() => handleRepage('globules', 'decrement')}
					><Icon src={FiChevronLeft} /></button
				>
				{#each globuleGeometries as globuleGeometry}
					<GlobuleTile2
						{globuleGeometry}
						size={300}
						onDelete={handleDeleteGlobule}
						onLoad={handleLoadGlobule}
					/>
				{/each}
				<button on:click={() => handleRepage('globules', 'increment')}
					><Icon src={FiChevronRight} /></button
				>
			</div>
			{#if data.superGlobuleConfigs}
				<h1>SuperGlobules</h1>
				<div class="globule-gallery">
					<button on:click={() => handleRepage('superGlobules', 'decrement')}
						><Icon src={FiChevronLeft} /></button
					>
					{#each superGlobuleGeometries as superGlobuleGeometry}
						<SuperGlobuleTile
							{superGlobuleGeometry}
							size={300}
							onDelete={handleDeleteSuperGlobule}
							onLoad={handleLoadSuperGlobule}
						/>
					{/each}
					<button on:click={() => handleRepage('superGlobules', 'increment')}
						><Icon src={FiChevronRight} /></button
					>
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
