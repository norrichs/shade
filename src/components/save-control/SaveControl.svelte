<script lang="ts">
	import type { RotatedShapeGeometryConfig } from '$lib/rotated-shape';
	import {
		saveLocalConfig,
		getLocal,
		resetLocal,
		AUTO_PERSIST_KEY,
		listLocalConfigs,

		setLocal,

		deleteLocal


	} from '../../lib/storage';
	import { spreadConfigToStores, resetStore } from '../../lib/stores';

	export let show = false;
	export let config: RotatedShapeGeometryConfig;
	export let update: () => void;

	let test: string | null;

	let persistLocalStorage = true;
	let storageKey = 'test_storage';

	let localConfigs = listLocalConfigs();

	const refreshList = () => localConfigs = listLocalConfigs()

</script>

<section class:show>
	<header>
		<h3>Data settings</h3>
		<p>
			{`${config.name} - ${config.id}`}
		</p>
	</header>
	<div class="column">
		<div class="row">
			<label for="persistent">Persist</label>
			<input type="checkbox" bind:checked={persistLocalStorage} />
			<button
				on:click={() => {
					resetLocal(AUTO_PERSIST_KEY);
					resetStore();
					console.debug('value after reset', config.shapeConfig);
					refreshList()
					update();
				}}>Reset</button
			>
			<button on:click={() => {
				saveLocalConfig(config)
				refreshList()
				}}>Save</button>
			<button
				on:click={() => {
					const retrieved = getLocal(storageKey);
					spreadConfigToStores(retrieved);
				}}>Retrieve</button
			>
			<!-- <button on:click={()=>test = resetToDefault(test)}>Reset</button> -->
		</div>
		{#if localConfigs?.length > 0}
			{#each localConfigs as localConfig}
				<div class="row" class:loaded-config-row={localConfig.id === config.id}>
					<input class="name-input" type="text" bind:value={localConfig.name} placeholder="name..." />
					<button on:click={() => spreadConfigToStores(getLocal(localConfig.id))}>Load</button>
					<button on:click={() => {
						deleteLocal(localConfig.id)
						refreshList()
					}}>Delete</button>
				</div>
			{/each}
		{/if}
	</div>
</section>

<style>
	section {
		display: none;
		padding: 30px;
	}
	.show {
		display: flex;
		flex-direction: column;
	}
	.column {
		display: flex;
		flex-direction: column;
	}
	.row {
		display: flex;
		flex-direction: row;
		gap: 30px;
	}
	.name-input {
		border: none;
	}
	.loaded-config-row {
		background-color: deeppink;
	}
</style>
