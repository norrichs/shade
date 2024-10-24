<script lang="ts">
	import { generateGlobuleData } from '$lib/generate-shape';
	import { superConfigStore as store } from '$lib/stores';
	import { FiTrash2, FiCopy, FiPlusSquare, FiGitBranch } from 'svelte-icons-pack/fi';
	import GlobuleTileSimple from '../../globule-tile/GlobuleTileSimple.svelte';

	import AddRemoveTransform from './AddRemoveTransform.svelte';
	import { Icon } from 'svelte-icons-pack';
	import {
		cloneSubGlobuleConfig,
		copySubGlobuleConfig,
		divergeSubGlobuleConfig
	} from '$lib/generate-superglobule';
	import GlobuleTileScene from '../../globule-tile/GlobuleTileScene.svelte';

	export let sgIndex: number;

	$: globule = generateGlobuleData($store.subGlobuleConfigs[sgIndex].globuleConfig);

	const removeSubGlobule = () => {
		$store.subGlobuleConfigs.splice(sgIndex, 1);
		$store.subGlobuleConfigs = $store.subGlobuleConfigs;
	};

	const copySubGlobule = () => {
		$store.subGlobuleConfigs.splice(
			sgIndex + 1,
			0,
			copySubGlobuleConfig($store.subGlobuleConfigs[sgIndex])
		);
		$store.subGlobuleConfigs = $store.subGlobuleConfigs;
	};

	const cloneSubGlobule = () => {
		$store.subGlobuleConfigs.splice(
			sgIndex + 1,
			0,
			cloneSubGlobuleConfig($store.subGlobuleConfigs[sgIndex])
		);
		$store.subGlobuleConfigs = $store.subGlobuleConfigs;
	};

	const diverge = () => {
		$store = divergeSubGlobuleConfig($store, $store.subGlobuleConfigs[sgIndex].id);
	};

	const updateTitle = (newTitle: string) => {
		if (newTitle && newTitle !== $store.subGlobuleConfigs[sgIndex].name) {
			$store.subGlobuleConfigs[sgIndex].name = newTitle;
		}
	};
</script>

<div class="container card-container">
	<header class="card-header">
		<div>
			<span
				contenteditable="true"
				on:input={(ev) => console.debug(ev)}
				on:blur={(ev) => updateTitle(ev.currentTarget?.textContent || '')}
			>
				{$store.subGlobuleConfigs[sgIndex].name}
			</span>
		</div>

		<button on:click={removeSubGlobule}>
			<Icon size="20" src={FiTrash2} />
		</button>
		<button on:click={copySubGlobule}>
			<Icon size="20" src={FiCopy} />
		</button>
		<button on:click={cloneSubGlobule}>
			<Icon size="20" src={FiPlusSquare} />
		</button>
		<button on:click={diverge}>
			<Icon size="20" src={FiGitBranch} />
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
		<div>
			{$store.subGlobuleConfigs[sgIndex].id}
		</div>
		<div>
			{$store.subGlobuleConfigs[sgIndex].globuleConfig.id}
		</div>
		<GlobuleTileSimple size={200}>
			<GlobuleTileScene globuleConfig={$store.subGlobuleConfigs[sgIndex].globuleConfig} {sgIndex} />
		</GlobuleTileSimple>
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
		grid-template-columns: 400px auto;
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
