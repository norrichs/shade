<script lang="ts">
	import { generateGlobuleData } from '$lib/generate-shape';
	import { superConfigStore as store } from '$lib/stores';
	import { FiMinusSquare, FiPlusSquare } from 'svelte-icons-pack/fi';
	import GlobuleTileSimple from '../../globule-tile/GlobuleTileSimple.svelte';

	import AddRemoveTransform from './AddRemoveTransform.svelte';
	import { Icon } from 'svelte-icons-pack';
	import { cloneSubGlobuleConfig } from '$lib/generate-superglobule';

	export let sgIndex: number;

	$: globule = generateGlobuleData($store.subGlobuleConfigs[sgIndex].globuleConfig);

	const removeSubGlobule = () => {
		$store.subGlobuleConfigs.splice(sgIndex, 1);
		$store.subGlobuleConfigs = $store.subGlobuleConfigs
	};

	const copySubGlobule = () => {
		$store.subGlobuleConfigs.splice(sgIndex + 1, 0, cloneSubGlobuleConfig($store.subGlobuleConfigs[sgIndex]));
		$store.subGlobuleConfigs = $store.subGlobuleConfigs
	}

	const updateTitle = (newTitle: string) => {
		if (newTitle && newTitle !== $store.subGlobuleConfigs[sgIndex].name) {
			$store.subGlobuleConfigs[sgIndex].name = newTitle;
		}
	};
</script>

<div class="container card-container">
	<header class="card-header">
		<h1
			contenteditable="true"
			on:input={(ev) => console.debug(ev)}
			on:blur={(ev) => updateTitle(ev.currentTarget?.textContent || '')}
		>
			{$store.subGlobuleConfigs[sgIndex].name}
		</h1>
		<button on:click={removeSubGlobule}>
			<Icon size="20" src={FiMinusSquare} />
		</button>
		<button on:click={copySubGlobule}>
			<Icon size="20" src={FiPlusSquare} />
		</button>
	</header>
	<div class="card-content">
		<slot />
		<AddRemoveTransform
			{sgIndex}
			tIndex={$store.subGlobuleConfigs[sgIndex].transforms.length - 1}
		/>
	</div>
	<div class="card-sidebar">
		<GlobuleTileSimple size={200} globuleConfig={$store.subGlobuleConfigs[sgIndex].globuleConfig} />
	</div>
</div>

<style>
	button {
		border: none;
		background-color: transparent;
		padding: 0;
		margin: 0;
	}
	header {
		display: flex;
		flex-direction: row;
	}
	h1 {
		padding: 4px;
		margin: 0;
	}
	.container {
		border: 1px solid var(--color-shaded-medium);
		width: 300px;
		padding: 8px;
	}
	.container div {
		padding: 8px;
	}
	.card-container {
		display: grid;
		grid-template-rows: 1rem 1fr;
		grid-template-columns: 1fr auto;
		grid-template-areas:
			'a a'
			'b c';
	}
	.card-header {
		grid-area: a;
	}
	.card-content {
		grid-area: b;
	}
	.card-sidebar {
		grid-area: c;
		padding: 4px;
	}
</style>
