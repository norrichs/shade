<script lang="ts">
	import { AUTO_PERSIST_KEY } from '$lib/persistable';
	import {
		saveLocalConfig,
		getLocal,
		resetLocal,
		listLocalConfigs,
		deleteLocal
	} from '$lib/storage';
	import { configStore0, shouldUsePersisted } from '$lib/stores/stores';
	import type { GlobuleConfig } from '$lib/types';

	export let show = false;
	export let config: GlobuleConfig;
	// export let update: () => void;

	let test: string | null;

	let persistLocalStorage = true;
	let storageKey = 'test_storage';

	let localConfigs = listLocalConfigs();

	const refreshList = () => (localConfigs = listLocalConfigs());
</script>

<section class:show>
	<header>
		<h3>Data settings</h3>
		<button on:click={() => console.log(config)}>
			{`${config.name} - ${config.id}`}
		</button>
	</header>
	<div class="column">
		<div class="row">
			<label for="persistent">Persist</label>
			<input type="checkbox" bind:checked={$shouldUsePersisted} />
			<button
				on:click={() => {
					resetLocal(AUTO_PERSIST_KEY);
					configStore0.reset();
					refreshList();
					// update();
				}}>Reset</button
			>
			<button
				on:click={() => {
					saveLocalConfig(config, true);
					refreshList();
				}}>New Save</button
			>
			<button on:click={() => ($configStore0 = getLocal(storageKey))}>Retrieve</button>
			<!-- <button on:click={()=>test = resetToDefault(test)}>Reset</button> -->
		</div>
		{#if localConfigs?.length > 0}
			{#each localConfigs as localConfig}
				<div class="row" class:loaded-config-row={localConfig.id === config.id}>
					<input
						class="name-input"
						type="text"
						bind:value={localConfig.name}
						on:input={() => {
							const config = getLocal(localConfig.id);
							if (config) {
								saveLocalConfig({ ...config, name: localConfig.name }, false);
							}
						}}
						placeholder="name..."
					/>
					<button on:click={() => ($configStore0 = getLocal(localConfig.id))}>Load</button>
					<button
						on:click={() => {
							deleteLocal(localConfig.id);
							configStore0.reset();
							refreshList();
						}}>Delete</button
					>
					{#if localConfig.id === config.id}
						<button
							on:click={() => {
								saveLocalConfig(config, false);
								refreshList();
							}}>Save</button
						>
					{/if}
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
