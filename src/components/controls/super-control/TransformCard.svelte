<script lang="ts">
	import type { GlobuleTransform } from '$lib/types';
	import { getConstants, getDefaultTransform } from '$lib/transform-globule';
	import { Icon } from 'svelte-icons-pack';
	import {
		FiMinusSquare,
		FiPlusSquare,
		FiChevronUp,
		FiChevronDown,
		FiXCircle
	} from 'svelte-icons-pack/fi';
	import { activeControl } from './active-control';
	import { interactionMode } from '../../three-renderer-v2/interaction-mode';
	import AddRemoveTransform from './AddRemoveTransform.svelte';
	import { superConfigStore as store } from '$lib/stores';

	export let transform: GlobuleTransform;
	export let sgIndex: number;
	export let tIndex: number;

	const closeCard = () => {
		$activeControl = undefined;
		$interactionMode = { type: 'standard' };
	};

	const shiftOrder = (direction: 'up' | 'down') => {
		let swapStart: number;
		if (direction === 'up' && tIndex > 0) {
			swapStart = tIndex - 1;
		} else if (
			direction === 'down' &&
			tIndex < $store.subGlobuleConfigs[sgIndex].transforms.length - 1
		) {
			swapStart = tIndex;
		} else {
			swapStart = -1;
		}

		if (swapStart === -1) return;

		const swap = window.structuredClone(
			$store.subGlobuleConfigs[sgIndex].transforms.splice(swapStart, 2)
		);
		$store.subGlobuleConfigs[sgIndex].transforms.splice(swapStart, 0, ...[swap[1], swap[0]]);
		$store.subGlobuleConfigs[sgIndex].transforms = $store.subGlobuleConfigs[sgIndex].transforms;
	};

	$: tx = getConstants(transform);
</script>

<div class="card-container">
	<header class="card-header">
		<div>{tx.title}</div>
		<div>
			<button on:click={() => shiftOrder('up')}><Icon size={20} src={FiChevronUp} /></button>
			<button on:click={() => shiftOrder('down')}><Icon size={20} src={FiChevronDown} /></button>
			<button on:click={closeCard}><Icon size={20} src={FiXCircle} /></button>
		</div>
	</header>
	<div class="card-content">
		<slot />
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
		width: 200px;
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
		flex-direction: row

	}
	.card-content {
		grid-area: b;
	}
	.card-sidebar {
		grid-area: c;
		padding: 4px;
	}
</style>
