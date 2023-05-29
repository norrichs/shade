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
	import { resetStore, config0 } from '../../lib/stores';

	export let show = false;
	export let config: RotatedShapeGeometryConfig;
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
			<input type="checkbox" bind:checked={persistLocalStorage} />
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
							console.debug('onChange ', localConfig.name);
							const config = getLocal(localConfig.id);
							if (config) {
								saveLocalConfig({ ...config, name: localConfig.name }, false);
							}
						}}
						placeholder="name..."
					/>
					<button on:click={() => ($config0 = getLocal(localConfig.id))}>Load</button>
					<button on:click={() =>{ saveLocalConfig(config, false); refreshList()}}>Save</button>
					<button
						on:click={() => {
							deleteLocal(localConfig.id);
							config0.reset();
							refreshList();
						}}>Delete</button
					>
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
