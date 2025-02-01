<script lang="ts">
	import { generateGenericSelection } from '$lib/stores';
	import type {
		Point3,
		GlobuleTransform,
		Recurrence,
		GlobuleTransformScale,
		RecombinatoryRecurrence
	} from '$lib/types';
	import RecurrenceControl from './RecurrenceControl.svelte';
	import { superConfigStore as store } from '$lib/stores';
	import { isGlobuleTransformScale } from '$lib/transform-globule';
	import { formatPoint3, isClose } from '$lib/util';
	import PointInput from './PointInput.svelte';
	import { interactionMode } from '../../three-renderer-v2/interaction-mode';
	import { round } from '$lib/util';
	import NumberInput from '../NumberInput.svelte';
	import { selectedBand } from '$lib/stores';
	import PickPointsButton from './PickPointsButton.svelte';

	export let sgIndex = 0;
	export let tIndex = 0;
	export let active = false;

	let recurs = $store.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs;
	let { anchor, scaleValue } = isGlobuleTransformScale(
		$store.subGlobuleConfigs[sgIndex].transforms[tIndex]
	)
		? $store.subGlobuleConfigs[sgIndex].transforms[tIndex].scale
		: {
				anchor: { x: 0, y: 0, z: 0 },
				scaleValue: 1
		  };

	const activate = () => {
		$selectedBand = { ...generateGenericSelection(sgIndex, tIndex + 1), t: tIndex };
		const transform = $store.subGlobuleConfigs[sgIndex].transforms[tIndex];
		if (isGlobuleTransformScale(transform)) {
			scaleValue = transform.scale.scaleValue;
			anchor = { ...transform.scale.anchor };
			recurs = transform.recurs;
		}
	};

	const isUpdatableScaleValue = (tx: GlobuleTransform): tx is GlobuleTransformScale => {
		return isGlobuleTransformScale(tx) && !isClose(tx.scale.scaleValue, scaleValue);
	};
	const isUpdatableAnchor = (tx: GlobuleTransform): tx is GlobuleTransformScale => {
		return (
			isGlobuleTransformScale(tx) &&
			(!isClose(tx.scale.anchor.x, anchor.x) ||
				!isClose(tx.scale.anchor.y, anchor.y) ||
				!isClose(tx.scale.anchor.z, anchor.z))
		);
	};
	const isUpdatableRecurs = (tx: GlobuleTransform & { recurs?: Recurrence }) => {
		if (!tx.recurs || !recurs) return true;
		const processedTxRecurs = tx.recurs;
		if (recurs.length !== processedTxRecurs.length) return true;

		let isUpdatable = false;
		recurs.forEach((recurrence, i) => {
			if (recurrence !== processedTxRecurs[i]) {
				isUpdatable = true;
			}
		});
		return isUpdatable;
	};

	const onSelectPoint = () => {
		if (!isGlobuleTransformScale($store.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			($interactionMode as any).type = 'standard';
			return;
		}
		if ($interactionMode.type === 'point-select-anchor') {
			[anchor] = $interactionMode.data.points;
			$store.subGlobuleConfigs[sgIndex].transforms[tIndex].scale.anchor = anchor;
		}

		($interactionMode as any).type = 'standard';
	};

	const updateStore = (scaleValue: number, anchor: Point3, recurs: RecombinatoryRecurrence[]) => {
		if (isUpdatableRecurs($store.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			$store.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs = recurs;
		}
		if (isUpdatableAnchor($store.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			$store.subGlobuleConfigs[sgIndex].transforms[tIndex].scale.anchor = anchor;
		}
		if (isUpdatableScaleValue($store.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			$store.subGlobuleConfigs[sgIndex].transforms[tIndex].scale.scaleValue = scaleValue;
		}
	};

	$: updateStore(scaleValue, anchor, recurs);
</script>

<div class="scale-card">
	{#if active}
		<div>
			<RecurrenceControl bind:recurs sgIndex tIndex />
			{#if isGlobuleTransformScale($store.subGlobuleConfigs[sgIndex].transforms[tIndex])}
				<div>
					<PointInput label="Anchor" bind:value={anchor} />
					<PickPointsButton
						mode={{ type: 'point-select-anchor', data: { pick: 1, points: [] }, onSelectPoint }}
					/>
				</div>
				<div>
					<NumberInput label="Scale" step={0.1} min={-10} max={10} bind:value={scaleValue} />
				</div>
			{/if}
		</div>
	{:else}
		<button class="display" on:click={activate}>
			<div class="recurrence-display">
				<span>Recurs: </span>
				{#each recurs as r, i}
					<div class="recurrence-display-item">{r.multiplier}</div>
				{/each}
			</div>
			<div>
				<span>Anchor: </span><span>{formatPoint3(anchor, 2)}</span>
			</div>
			<div>
				<span>Sacle: </span><span>{round(scaleValue, 3)}</span>
			</div>
		</button>
	{/if}
</div>

<style>
	.scale-card {
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
