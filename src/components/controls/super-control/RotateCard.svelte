<script lang="ts">
	import { degToRad, radToDeg } from '$lib/patterns/utils';
	import { generateGenericSelection, selectedBand, superConfigStore } from '$lib/stores';
	import { isGlobuleTransformRotate } from '$lib/transform-globule';

	import type {
		GlobuleRotate,
		GlobuleTransform,
		GlobuleTransformRotate,
		Point3,
		RecombinatoryRecurrence,
		Recurrence
	} from '$lib/types';
	import CombinedNumberInput from '../CombinedNumberInput.svelte';
	import RecurrenceControl from './RecurrenceControl.svelte';
	import PointInput from './PointInput.svelte';
	import PickPointsButton from './PickPointsButton.svelte';
	import { interactionMode } from '../../three-renderer-v2/interaction-mode';
	import { Vector3 } from 'three';
	import { isClose } from '$lib/util';

	export let sgIndex = 0;
	export let tIndex = 0;
	export let active = false;

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

	let recurs = $superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].recurs;

	const activate = () => {
		$selectedBand = { ...generateGenericSelection(sgIndex, tIndex + 1), t: tIndex };
		const transform = $superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex];
		if (isGlobuleTransformRotate(transform)) {
			angle = radToDeg(transform.rotate.angle);
			axis = { ...transform.rotate.axis };
			anchor = { ...transform.rotate.anchor };
			recurs = transform.recurs;
		}
	};

	const isUpdatableRotation = (tx: GlobuleTransform): tx is GlobuleTransformRotate => {
		return isGlobuleTransformRotate(tx) && !isClose(tx.rotate.angle, degToRad(angle));
	};
	const isUpdatableAxis = (tx: GlobuleTransform): tx is GlobuleTransformRotate => {
		return (
			isGlobuleTransformRotate(tx) &&
			(!isClose(tx.rotate.axis.x, axis.x) ||
				!isClose(tx.rotate.axis.y, axis.y) ||
				!isClose(tx.rotate.axis.z, axis.z))
		);
	};
	const isUpdatableAnchor = (tx: GlobuleTransform): tx is GlobuleTransformRotate => {
		return (
			isGlobuleTransformRotate(tx) &&
			(!isClose(tx.rotate.anchor.x, anchor.x) ||
				!isClose(tx.rotate.anchor.y, anchor.y) ||
				!isClose(tx.rotate.anchor.z, anchor.z))
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

	const updateStore = (
		angle: number,
		axis: Point3,
		anchor: Point3,
		recurs: RecombinatoryRecurrence[]
	) => {
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

	const onSelectPoint = () => {
		if (
			!isGlobuleTransformRotate($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])
		) {
			($interactionMode as any).type = 'standard';
			return;
		}

		if ($interactionMode.type === 'point-select-rotate') {
			const [p0, p1] = $interactionMode.data.points;

			anchor = p0;

			const normalizedAxis = new Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).setLength(1);
			axis = { x: normalizedAxis.x, y: normalizedAxis.y, z: normalizedAxis.z };
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].rotate = {
				anchor,
				axis,
				angle
			};
		} else if ($interactionMode.type === 'point-select-anchor') {
			[anchor] = $interactionMode.data.points;
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].rotate.anchor = anchor;
		} else if ($interactionMode.type === 'point-select-axis') {
			const [p0, p1] = $interactionMode.data.points;
			const normalizedAxis = new Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).setLength(1);
			axis = { x: normalizedAxis.x, y: normalizedAxis.y, z: normalizedAxis.z };
			$superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex].rotate.axis = axis;
		}

		($interactionMode as any).type = 'standard';
	};

	$: updateStore(angle, axis, anchor, recurs);
</script>

<div class="rotate-card">
	{#if active}
		<div>
			<RecurrenceControl bind:recurs {sgIndex} {tIndex} />
			{#if isGlobuleTransformRotate($superConfigStore.subGlobuleConfigs[sgIndex].transforms[tIndex])}
				<CombinedNumberInput bind:value={angle} label="Rotate" min={-360} max={360} step={0.1} />
				<div>
					<PointInput label="Axis" constraint={{ length: 1 }} bind:value={axis} />
					<PickPointsButton
						mode={{ type: 'point-select-axis', data: { pick: 2, points: [] }, onSelectPoint }}
					/>
				</div>
				<div>
					<PointInput label="Anchor" bind:value={anchor} />
					<PickPointsButton
						mode={{ type: 'point-select-anchor', data: { pick: 1, points: [] }, onSelectPoint }}
					/>
				</div>
				<PickPointsButton
					mode={{ type: 'point-select-rotate', data: { pick: 2, points: [] }, onSelectPoint }}
				/>
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
