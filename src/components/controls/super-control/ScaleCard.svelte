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
	import { interactionMode } from '../../three-renderer/interaction-mode';
	import { round } from '$lib/util';
	import NumberInput from '../NumberInput.svelte';
	import { selectedBand } from '$lib/stores';
	import PickPointsButton from './PickPointsButton.svelte';
	import { get } from 'svelte/store';

	let { sgIndex = 0, tIndex = 0, active = false }: {
		sgIndex?: number;
		tIndex?: number;
		active?: boolean;
	} = $props();

	let initConfig = get(store);
	let initTransform = initConfig.subGlobuleConfigs[sgIndex].transforms[tIndex];

	let recurs: RecombinatoryRecurrence[] = $state(initTransform.recurs);
	let anchor: Point3 = $state(
		isGlobuleTransformScale(initTransform)
			? { ...initTransform.scale.anchor }
			: { x: 0, y: 0, z: 0 }
	);
	let scaleValue = $state(
		isGlobuleTransformScale(initTransform)
			? initTransform.scale.scaleValue
			: 1
	);

	const activate = () => {
		selectedBand.set({ ...generateGenericSelection(sgIndex, tIndex + 1), t: tIndex });
		const config = get(store);
		const transform = config.subGlobuleConfigs[sgIndex].transforms[tIndex];
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
		const config = get(store);
		if (!isGlobuleTransformScale(config.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			interactionMode.set({ type: 'standard' });
			return;
		}
		const mode = get(interactionMode);
		if (mode.type === 'point-select-anchor') {
			[anchor] = mode.data.points;
			config.subGlobuleConfigs[sgIndex].transforms[tIndex].scale.anchor = anchor;
			store.set(config);
		}

		interactionMode.set({ type: 'standard' });
	};

	const updateStore = (scaleValue: number, anchor: Point3, recurs: RecombinatoryRecurrence[]) => {
		const config = get(store);
		const tx = config.subGlobuleConfigs[sgIndex].transforms[tIndex];
		let changed = false;
		if (isUpdatableRecurs(tx)) {
			tx.recurs = recurs;
			changed = true;
		}
		if (isUpdatableAnchor(tx)) {
			tx.scale.anchor = anchor;
			changed = true;
		}
		if (isUpdatableScaleValue(tx)) {
			tx.scale.scaleValue = scaleValue;
			changed = true;
		}
		if (changed) {
			store.set(config);
		}
	};

	$effect(() => {
		updateStore(scaleValue, anchor, recurs);
	});
</script>

<div class="scale-card">
	{#if active}
		<div>
			<RecurrenceControl bind:recurs {sgIndex} {tIndex} />
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
		<button class="display" onclick={activate}>
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
