<script lang="ts">
	import ControlGroup from './ControlGroup.svelte';
	import type { GlobuleTransform, SubGlobuleConfig, SuperGlobuleConfig } from '$lib/types';
	import { superConfigStore } from '$lib/stores';
	import CombinedNumberInput from './CombinedNumberInput.svelte';

	console.debug($superConfigStore);
	let x: SubGlobuleConfig;
	let tx: GlobuleTransform;
	let store: SuperGlobuleConfig;
	$: store = $superConfigStore;
</script>

<section>
	<h4>Super</h4>
	<div>{store.name}</div>
	<div>{store.subGlobuleConfigs.length}</div>
	<div>
		{#each store.subGlobuleConfigs as subGlobuleConfig, i}
			<div>
				<div>{subGlobuleConfig.name}</div>
				<div>
					{#if !Array.isArray($superConfigStore.subGlobuleConfigs[i].transform.recurs)}
						<CombinedNumberInput
							label="Recurs"
							bind:value={$superConfigStore.subGlobuleConfigs[i].transform.recurs}
							min={1}
							max={20}
							step={1}
						/>
					{/if}
					{#if $superConfigStore.subGlobuleConfigs[i].transform.translate}
						<CombinedNumberInput
							bind:value={$superConfigStore.subGlobuleConfigs[i].transform.translate.x}
							label="Translate X"
							max={500}
							step={1}
						/>
						<CombinedNumberInput
							bind:value={$superConfigStore.subGlobuleConfigs[i].transform.translate.y}
							label="Translate Y"
							max={500}
							step={1}
						/>
						<CombinedNumberInput
							bind:value={$superConfigStore.subGlobuleConfigs[i].transform.translate.z}
							label="Translate Z"
							max={500}
							step={1}
						/>
					{/if}
					{#if $superConfigStore.subGlobuleConfigs[i].transform.rotate}
						<CombinedNumberInput
							bind:value={$superConfigStore.subGlobuleConfigs[i].transform.rotate.anchor}
							label="Translate Z"
							max={500}
							step={1}
						/>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</section>
