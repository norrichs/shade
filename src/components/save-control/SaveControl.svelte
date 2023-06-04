<script lang="ts">
	import type { ShadesConfig } from '$lib/rotated-shape';
	import { AUTO_PERSIST_KEY } from '$lib/persistable';
	import {
		saveLocalConfig,
		getLocal,
		resetLocal,
		listLocalConfigs,
		deleteLocal
	} from '$lib/storage';
	import { config0, usePersisted } from '$lib/stores';

	export let show = false;
	export let config: ShadesConfig;
	export let update: () => void;

	let test: string | null;

	let persistLocalStorage = true;
	let storageKey = 'test_storage';

	let localConfigs = listLocalConfigs();

	const refreshList = () => (localConfigs = listLocalConfigs());
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
			<input type="checkbox" bind:checked={$usePersisted} />
			<button
				on:click={() => {
					resetLocal(AUTO_PERSIST_KEY);
					config0.reset();
					refreshList();
					update();
				}}>Reset</button
			>
			<button
				on:click={() => {
					saveLocalConfig(config, true);
					refreshList();
				}}>New Save</button
			>
			<button on:click={() => ($config0 = getLocal(storageKey))}>Retrieve</button>
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
					<button on:click={() => ($config0 = getLocal(localConfig.id))}>Load</button>
					<button
						on:click={() => {
							deleteLocal(localConfig.id);
							config0.reset();
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
