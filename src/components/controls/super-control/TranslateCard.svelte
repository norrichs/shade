<script lang="ts">
	import { degToRad, radToDeg } from '$lib/patterns/utils';
	import { superConfigStore } from '$lib/stores';
	import {
		getRecurrences,
		isGlobuleTransformRotate,
		isGlobuleTransformTranslate
	} from '$lib/transform-globule';
	import { activeControl } from './active-control';

	import type {
		GlobuleTransform,
		GlobuleTransformTranslate,
		Recurrence
	} from '$lib/types';
	import CombinedNumberInput from '../CombinedNumberInput.svelte';
	import RecurrenceControl from './RecurrenceControl.svelte';

	export let sgIndex = 0;
	export let tIndex = 0;
	export let active = false;

	let {
		x: tX,
		y: tY,
		z: tZ
	} = isGlobuleTransformTranslate($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])
		? $superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].translate
		: { x: 0, y: 0, z: 0 };

	let recurs = getRecurrences(
		$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs
	);

	const activate = () => ($activeControl = { sgIndex, tIndex });

	const isUpdatableTranslation = (tx: GlobuleTransform): tx is GlobuleTransformTranslate => {
		return (
			isGlobuleTransformTranslate(tx) &&
			(tx.translate.x !== tX || tx.translate.y !== tY || tx.translate.z !== tZ)
		);
	};
	const isUpdatableRecurs = (tx: GlobuleTransform & { recurs?: Recurrence }) => tx.recurs;

	const updateStore = (tX: number, tY: number, tZ: number, recurs: number[]) => {
		console.debug('updateStore', tX, tY, tZ, recurs);

		if (isUpdatableTranslation($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].translate = {
				x: tX,
				y: tY,
				z: tZ
			};
		}
		if (isUpdatableRecurs($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs = recurs;
		}
	};

	$: updateStore(tX, tY, tZ, recurs);
</script>

<div class="rotate-card">
	{#if active}
		<div>
			<RecurrenceControl bind:recurs />
			{#if isGlobuleTransformTranslate($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])}
				<CombinedNumberInput bind:value={tX} label="X" min={-360} max={360} step={0.1} />
				<CombinedNumberInput bind:value={tY} label="Y" min={-360} max={360} step={0.1} />
				<CombinedNumberInput bind:value={tZ} label="Z" min={-360} max={360} step={0.1} />
			{/if}
		</div>
	{:else}
		<button class="display" on:click={activate}>
			<div class="recurrence-display">
				<span>Recurs: </span>
				{#each recurs as r, i}
					<div class="recurrence-display-item">{r}</div>
				{/each}
			</div>
			<div>
				{`X: ${tX}, Y: ${tY}, Z: ${tZ}`}
			</div>
		</button>
	{/if}
</div>

<style>
	.rotate-card {
		border: 1px solid black;
	}
	.display {
		outline: none;
		border: none;
		width: 100%;
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		padding: 4px;
	}
	.recurrence-display {
		display: flex;
		flex-direction: row;
		gap: 4px;
	}
	.recurrence-display-item {
		background-color: var(--color-highlight);
		border: 0;
		padding: 2px 6px;
		/* min-width: 20px; */
		border-radius: 4px;
	}
</style>
