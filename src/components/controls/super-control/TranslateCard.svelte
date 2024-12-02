<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import { getRecurrences, isGlobuleTransformTranslate } from '$lib/transform-globule';
	import { activeControl } from './active-control';

	import type { GlobuleTransform, GlobuleTransformTranslate, Point3, RecombinatoryRecurrence, Recurrence } from '$lib/types';
	import RecurrenceControl from './RecurrenceControl.svelte';
	import PickPointsButton from './PickPointsButton.svelte';
	import PointInput from './PointInput.svelte';
	import { round } from '$lib/util';
	import { interactionMode } from '../../three-renderer-v2/interaction-mode';

	export let sgIndex = 0;
	export let tIndex = 0;
	export let active = false;

	let delta = isGlobuleTransformTranslate(
		$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex]
	)
		? $superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].translate
		: { x: 0, y: 0, z: 0 };

	let recurs = getRecurrences(
		$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs
	);

	const activate = () => ($activeControl = { sgIndex, tIndex });

	const isUpdatableTranslation = (tx: GlobuleTransform): tx is GlobuleTransformTranslate => {
		return (
			isGlobuleTransformTranslate(tx) &&
			(tx.translate.x !== delta.x || tx.translate.y !== delta.y || tx.translate.z !== delta.z)
		);
	};
	const isUpdatableRecurs = (tx: GlobuleTransform & { recurs?: Recurrence }) => {
		if (!tx.recurs) return true;
		let isUpdatable = false;
		const processedTxRecurs = getRecurrences(tx.recurs);
		recurs.forEach((recurrence, i) => {
			if (recurrence !== processedTxRecurs[i]) {
				isUpdatable = true;
			}
		});
		return isUpdatable;
	};



	const onSelectPoint = () => {
		if (
			$interactionMode.type === 'point-select-translate' &&
			// $interactionMode.data.points.length === $interactionMode.data.pick &&
			isGlobuleTransformTranslate($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])
		) {
			const [p0, p1] = $interactionMode.data.points;
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].translate = {
				x: p1.x - p0.x,
				y: p1.y - p0.y,
				z: p1.z - p0.z
			};
			($interactionMode as any).type = 'standard';
			updateLocal($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex]);
		}
	};
	const updateStore = (delta: Point3, recurs: RecombinatoryRecurrence[]) => {
		console.debug('updateStore', delta, recurs);

		if (isUpdatableTranslation($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			console.debug("||| isUpdatableTranlsation")
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].translate = { ...delta };
		}
		if (isUpdatableRecurs($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			console.debug("||| is updateable Recurs")
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs = recurs;
		}
	};
	const updateLocal = (transform: GlobuleTransform) => {
		console.debug("update local", transform)
		if (isGlobuleTransformTranslate(transform)) {
			delta = { ...transform.translate };
		}
	};

	$: updateLocal($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex]);

	$: updateStore(delta, recurs);
</script>

<div class="rotate-card">
	{#if active}
		<div>
			<RecurrenceControl bind:recurs />
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
		<button class="display" on:click={activate}>
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
