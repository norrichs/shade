<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { GlobuleTransform } from '$lib/types';
	import { getConstants } from '$lib/transform-globule';
	import { Icon } from 'svelte-icons-pack';
	import {
		FiChevronUp,
		FiChevronDown,
		FiXCircle
	} from 'svelte-icons-pack/fi';
	import { interactionMode } from '../../three-renderer/interaction-mode';
	import AddRemoveTransform from './AddRemoveTransform.svelte';
	import { selectedBand, superConfigStore as store } from '$lib/stores';
	import { get } from 'svelte/store';

	let { transform, sgIndex, tIndex, children }: {
		transform: GlobuleTransform;
		sgIndex: number;
		tIndex: number;
		children: Snippet;
	} = $props();

	let tx = $derived(getConstants(transform));

	const closeCard = () => {
		const band = get(selectedBand);
		selectedBand.set({ ...band, t: undefined });
		interactionMode.set({ type: 'standard' });
	};

	const shiftOrder = (direction: 'up' | 'down') => {
		const config = get(store);
		let swapStart: number;
		if (direction === 'up' && tIndex > 0) {
			swapStart = tIndex - 1;
		} else if (
			direction === 'down' &&
			tIndex < config.subGlobuleConfigs[sgIndex].transforms.length - 1
		) {
			swapStart = tIndex;
		} else {
			swapStart = -1;
		}

		if (swapStart === -1) return;

		const swap = window.structuredClone(
			config.subGlobuleConfigs[sgIndex].transforms.splice(swapStart, 2)
		);
		config.subGlobuleConfigs[sgIndex].transforms.splice(swapStart, 0, ...[swap[1], swap[0]]);
		config.subGlobuleConfigs[sgIndex].transforms = config.subGlobuleConfigs[sgIndex].transforms;
		store.set(config);
	};
</script>

<div class="card-container">
	<header class="card-header">
		<div>{tx.title}</div>
		<div>
			<button onclick={() => shiftOrder('up')}><Icon size={20} src={FiChevronUp} /></button>
			<button onclick={() => shiftOrder('down')}><Icon size={20} src={FiChevronDown} /></button>
			<button onclick={closeCard}><Icon size={20} src={FiXCircle} /></button>
		</div>
	</header>
	<div class="card-content">
		{@render children()}
	</div>
	<div class="card-sidebar">
		<AddRemoveTransform {sgIndex} {tIndex} />
	</div>
</div>

<style>
	button {
		border: none;
		background-color: transparent;
		margin: 0;
		padding: 0;
	}
	.card-container {
		width: 400px;
		display: grid;
		grid-template-rows: 1.5rem 1fr;
		grid-template-columns: 1fr auto;
		grid-template-areas:
			'a a'
			'b c';
	}
	.card-header {
		height: 1.5rem;
		grid-area: a;
		display: flex;
		flex-direction: row;
		justify-content: space-between;
	}
	.card-header div {
		display: flex;
		flex-direction: row;
	}
	.card-content {
		grid-area: b;
	}
	.card-sidebar {
		grid-area: c;
		padding: 4px;
	}
</style>
