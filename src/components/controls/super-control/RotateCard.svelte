<script lang="ts">
	import { degToRad, radToDeg } from '$lib/patterns/utils';
	import { superConfigStore } from '$lib/stores';
	import { getRecurrences, isGlobuleTransformRotate } from '$lib/transform-globule';
	import { activeControl } from './active-control';

	import type {
		GlobuleRotate,
		GlobuleTransform,
		GlobuleTransformRotate,
		Point3,
		Recurrence
	} from '$lib/types';
	import CombinedNumberInput from '../CombinedNumberInput.svelte';
	import RecurrenceControl from './RecurrenceControl.svelte';
	import PointInput from './PointInput.svelte';

	export let sgIndex = 0;
	export let tIndex = 0;
	export let active = false;

	console.debug('active', active);
	let angle = isGlobuleTransformRotate(
		$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex]
	)
		? radToDeg($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].rotate.angle)
		: 0;
	let { axis, anchor } = isGlobuleTransformRotate(
		$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex]
	)
		? $superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].rotate
		: { axis: { x: 0, y: 0, z: 1 }, anchor: { x: 0, y: 0, z: 0 } };

	let recurs = getRecurrences(
		$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs
	);

	const activate = () => {
		console.debug('activate', { sgIndex, tIndex });
		$activeControl = { sgIndex, tIndex };
	};

	const isUpdatableRotation = (tx: GlobuleTransform): tx is GlobuleTransformRotate => {
		return isGlobuleTransformRotate(tx) && tx.rotate.angle !== angle;
	};
	const isUpdatableAxis = (tx: GlobuleTransform): tx is GlobuleTransformRotate => {
		return (
			isGlobuleTransformRotate(tx) &&
			(tx.rotate.axis.x !== axis.x || tx.rotate.axis.y !== axis.y || tx.rotate.axis.z !== axis.z)
		);
	};
	const isUpdatableAnchor = (tx: GlobuleTransform): tx is GlobuleTransformRotate => {
		return (
			isGlobuleTransformRotate(tx) &&
			(tx.rotate.anchor.x !== anchor.x ||
				tx.rotate.anchor.y !== anchor.y ||
				tx.rotate.anchor.z !== anchor.z)
		);
	};
	const isUpdatableRecurs = (tx: GlobuleTransform & { recurs?: Recurrence }) => tx.recurs;

	const updateStore = (angle: number, axis: Point3, recurs: number[]) => {
		console.debug('updateStore', angle, recurs);

		if (isUpdatableRotation($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].rotate.angle =
				degToRad(angle);
		}
		if (isUpdatableRecurs($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs = recurs;
		}
		if (isUpdatableAxis($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].rotate.axis = axis;
		}
		if (isUpdatableAnchor($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].rotate.anchor = anchor;
		}
	};

	$: updateStore(angle, axis, recurs);
</script>

<div class="rotate-card">
	{#if active}
		<div>
			<RecurrenceControl bind:recurs />
			{#if isGlobuleTransformRotate($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])}
				<CombinedNumberInput bind:value={angle} label="Rotate" min={-360} max={360} step={0.1} />
				<PointInput label="Axis" constraint={{ length: 1 }} bind:value={axis} />
				<PointInput label="Anchor" bind:value={anchor} />
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
				<span>Angle: </span><span>{Math.round(angle * 10) / 10}</span>
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
