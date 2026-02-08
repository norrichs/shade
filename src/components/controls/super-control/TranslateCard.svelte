<script lang="ts">
	import { generateGenericSelection, selectedBand, superConfigStore } from '$lib/stores';
	import { isGlobuleTransformTranslate } from '$lib/transform-globule';

	import type {
		GlobuleTransform,
		GlobuleTransformTranslate,
		Point3,
		RecombinatoryRecurrence,
		Recurrence
	} from '$lib/types';
	import RecurrenceControl from './RecurrenceControl.svelte';
	import PickPointsButton from './PickPointsButton.svelte';
	import PointInput from './PointInput.svelte';
	import { round } from '$lib/util';
	import { interactionMode } from '../../three-renderer/interaction-mode';
	import { get } from 'svelte/store';

	let { sgIndex = 0, tIndex = 0, active = false }: {
		sgIndex?: number;
		tIndex?: number;
		active?: boolean;
	} = $props();

	let initConfig = get(superConfigStore);
	let initTransform = initConfig.subGlobuleConfigs[sgIndex].transforms[tIndex];

	let delta: Point3 = $state(
		isGlobuleTransformTranslate(initTransform)
			? { ...initTransform.translate }
			: { x: 0, y: 0, z: 0 }
	);

	let recurs: RecombinatoryRecurrence[] = $state(initTransform.recurs);

	const activate = () => {
		selectedBand.set({ ...generateGenericSelection(sgIndex, tIndex + 1), t: tIndex });
	};

	const isUpdatableTranslation = (tx: GlobuleTransform): tx is GlobuleTransformTranslate => {
		return (
			isGlobuleTransformTranslate(tx) &&
			(tx.translate.x !== delta.x || tx.translate.y !== delta.y || tx.translate.z !== delta.z)
		);
	};
	const isUpdatableRecurs = (tx: GlobuleTransform & { recurs?: Recurrence }) => {
		if (!tx.recurs) return true;
		let isUpdatable = false;
		const processedTxRecurs = tx.recurs;
		recurs.forEach((recurrence, i) => {
			if (recurrence !== processedTxRecurs[i]) {
				isUpdatable = true;
			}
		});
		return isUpdatable;
	};

	const onSelectPoint = () => {
		const config = get(superConfigStore);
		const mode = get(interactionMode);
		if (
			mode.type === 'point-select-translate' &&
			isGlobuleTransformTranslate(config.subGlobuleConfigs[sgIndex].transforms[tIndex])
		) {
			const [p0, p1] = mode.data.points;
			config.subGlobuleConfigs[sgIndex].transforms[tIndex].translate = {
				x: p1.x - p0.x,
				y: p1.y - p0.y,
				z: p1.z - p0.z
			};
			superConfigStore.set(config);
			interactionMode.set({ type: 'standard' });
			updateLocal(config.subGlobuleConfigs[sgIndex].transforms[tIndex]);
		}
	};
	const updateStore = (delta: Point3, recurs: RecombinatoryRecurrence[]) => {
		const config = get(superConfigStore);
		const tx = config.subGlobuleConfigs[sgIndex].transforms[tIndex];
		let changed = false;
		if (isUpdatableTranslation(tx)) {
			tx.translate = { ...delta };
			changed = true;
		}
		if (isUpdatableRecurs(tx)) {
			tx.recurs = recurs;
			changed = true;
		}
		if (changed) {
			superConfigStore.set(config);
		}
	};
	const updateLocal = (transform: GlobuleTransform) => {
		if (isGlobuleTransformTranslate(transform)) {
			delta = { ...transform.translate };
		}
	};

	$effect(() => {
		const config = get(superConfigStore);
		updateLocal(config.subGlobuleConfigs[sgIndex].transforms[tIndex]);
	});

	$effect(() => {
		updateStore(delta, recurs);
	});
</script>

<div class="rotate-card">
	{#if active}
		<div>
			<RecurrenceControl bind:recurs {sgIndex} {tIndex} />
			{#if isGlobuleTransformTranslate($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])}
				<div>
					<PointInput label="Offset" bind:value={delta} />
					<PickPointsButton
						mode={{ type: 'point-select-translate', data: { pick: 2, points: [] }, onSelectPoint }}
					/>
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
				{`(${round(delta.x, 2)}, ${round(delta.y, 2)}, ${round(delta.z, 2)})`}
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
