<script lang="ts">
	import type { Snippet } from 'svelte';
	import { generateGlobuleData } from '$lib/generate-shape';
	import { superConfigStore as store, selectedBand } from '$lib/stores';
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
	import TextInput from '../../design-system/TextInput.svelte';
	import { get } from 'svelte/store';

	let { sgIndex, active = false, children }: {
		sgIndex: number;
		active?: boolean;
		children: Snippet;
	} = $props();

	let globule = $derived(generateGlobuleData($store.subGlobuleConfigs[sgIndex].globuleConfig));

	const removeSubGlobule = () => {
		const config = get(store);
		config.subGlobuleConfigs.splice(sgIndex, 1);
		config.subGlobuleConfigs = config.subGlobuleConfigs;
		store.set(config);
	};

	const copySubGlobule = () => {
		const config = get(store);
		config.subGlobuleConfigs.splice(
			sgIndex + 1,
			0,
			copySubGlobuleConfig(config.subGlobuleConfigs[sgIndex])
		);
		config.subGlobuleConfigs = config.subGlobuleConfigs;
		store.set(config);
	};

	const cloneSubGlobule = () => {
		const config = get(store);
		config.subGlobuleConfigs.splice(
			sgIndex + 1,
			0,
			cloneSubGlobuleConfig(config.subGlobuleConfigs[sgIndex])
		);
		config.subGlobuleConfigs = config.subGlobuleConfigs;
		store.set(config);
	};

	const diverge = () => {
		const config = get(store);
		store.set(divergeSubGlobuleConfig(config, config.subGlobuleConfigs[sgIndex].id));
	};
</script>

<div
	class="sub-globule container card-container"
	style={`--left-border-color: ${active ? 'blue' : 'red'};`}
>
	<header class="card-header">
		<TextInput bind:value={$store.subGlobuleConfigs[sgIndex].name} />

		<button onclick={removeSubGlobule}>
			<Icon size="20" src={FiTrash2} />
		</button>
		<button onclick={copySubGlobule}>
			<Icon size="20" src={FiCopy} />
		</button>
		<button onclick={cloneSubGlobule}>
			<Icon size="20" src={FiPlusSquare} />
		</button>
		<button onclick={diverge}>
			<Icon size="20" src={FiGitBranch} />
		</button>
	</header>
	<div class="card-content">
		{@render children()}
		<AddRemoveTransform
			{sgIndex}
			tIndex={$store.subGlobuleConfigs[sgIndex].transforms.length - 1}
		/>
	</div>
	<div class="card-sidebar">
		<GlobuleTileSimple size={100}>
			<GlobuleTileScene
				globuleConfig={$store.subGlobuleConfigs[sgIndex].globuleConfig}
				{sgIndex}
				selected={sgIndex === $selectedBand.s}
			/>
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
		/* border: 1px solid var(--color-shaded-medium); */
		padding: 0;
	}
	.card-container {
		display: grid;
		grid-template-rows: auto auto;
		grid-template-columns: 400px auto;
		grid-template-areas:
			'a a'
			'b c';
	}
	.card-header {
		padding: 4px;
		grid-area: a;
	}
	.card-content {
		margin-left: 8px;
		border-left: 4px solid var(--left-border-color);
		padding-left: 12px;
		grid-area: b;
	}
	.card-sidebar {
		display: flex;
		flex-direction: row;
		justify-content: flex-end;
		grid-area: c;
		padding: 4px;
	}
</style>
