<script lang="ts">
	import { generateGenericSelection, selectedBand } from '$lib/stores';
	import type {
		Point3,
		GlobuleTransform,
		GlobuleTransformRotate,
		Recurrence,
		GlobuleTransformReflect,
		RecombinatoryRecurrence
	} from '$lib/types';
	import RecurrenceControl from './RecurrenceControl.svelte';
	import { superConfigStore as store } from '$lib/stores';
	import { isGlobuleTransformReflect } from '$lib/transform-globule';
	import { formatPoint3, isClose } from '$lib/util';
	import PointInput from './PointInput.svelte';
	import PickPointsButton from './PickPointsButton.svelte';
	import { interactionMode } from '../../three-renderer/interaction-mode';
	import { Vector3, Triangle } from 'three';
	import { isSameRecombination } from '$lib/matchers';
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
		isGlobuleTransformReflect(initTransform)
			? { ...initTransform.reflect.anchor }
			: { x: 0, y: 0, z: 0 }
	);
	let normal: Point3 = $state(
		isGlobuleTransformReflect(initTransform)
			? { ...initTransform.reflect.normal }
			: { x: 0, y: 0, z: 1 }
	);

	const activate = () => {
		selectedBand.set({ ...generateGenericSelection(sgIndex, tIndex + 1), t: tIndex });
		const config = get(store);
		const transform = config.subGlobuleConfigs[sgIndex].transforms[tIndex];
		if (isGlobuleTransformReflect(transform)) {
			normal = { ...transform.reflect.normal };
			anchor = { ...transform.reflect.anchor };
			recurs = transform.recurs;
		}
	};

	const isUpdatableAnchor = (tx: GlobuleTransform): tx is GlobuleTransformReflect => {
		return (
			isGlobuleTransformReflect(tx) &&
			(!isClose(tx.reflect.anchor.x, anchor.x) ||
				!isClose(tx.reflect.anchor.y, anchor.y) ||
				!isClose(tx.reflect.anchor.z, anchor.z))
		);
	};
	const isUpdatableNormal = (tx: GlobuleTransform): tx is GlobuleTransformReflect => {
		return (
			isGlobuleTransformReflect(tx) &&
			(!isClose(tx.reflect.normal.x, normal.x) ||
				!isClose(tx.reflect.normal.y, normal.y) ||
				!isClose(tx.reflect.normal.z, normal.z))
		);
	};

	const isSameRecurrence = (a: RecombinatoryRecurrence, b: RecombinatoryRecurrence) => {
		return (
			a.multiplier === b.multiplier &&
			a.ghost === b.ghost &&
			isSameRecombination(a.recombines, b.recombines)
		);
	};
	const isUpdatableRecurs = (tx: GlobuleTransform & { recurs?: Recurrence }) => {
		if (!tx.recurs || !recurs) return true;
		const processedTxRecurs = tx.recurs;
		if (recurs.length !== processedTxRecurs.length) return true;

		let isUpdatable = false;
		recurs.forEach((recurrence, i) => {
			if (!isSameRecurrence(recurrence, processedTxRecurs[i])) {
				isUpdatable = true;
			}
		});
		return isUpdatable;
	};

	const onSelectPoint = () => {
		const config = get(store);
		if (!isGlobuleTransformReflect(config.subGlobuleConfigs[sgIndex].transforms[tIndex])) {
			interactionMode.set({ type: 'standard' });
			return;
		}
		const mode = get(interactionMode);
		if (mode.type === 'point-select-anchor') {
			[anchor] = mode.data.points;
			config.subGlobuleConfigs[sgIndex].transforms[tIndex].reflect.anchor = anchor;
			store.set(config);
		} else if (mode.type === 'point-select-axis') {
			const [p0, p1] = mode.data.points;
			const normalizedAxis = new Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).setLength(1);
			normal = { x: normalizedAxis.x, y: normalizedAxis.y, z: normalizedAxis.z };
			config.subGlobuleConfigs[sgIndex].transforms[tIndex].reflect.normal = normal;
			store.set(config);
		} else if (mode.type === 'point-select-plane') {
			const [p0, p1, p2] = mode.data.points;
			anchor = p0;
			const normalVector = new Vector3();
			new Triangle(
				new Vector3(p0.x, p0.y, p0.z),
				new Vector3(p1.x, p1.y, p1.z),
				new Vector3(p2.x, p2.y, p2.z)
			).getNormal(normalVector);
			normal = { x: normalVector.x, y: normalVector.y, z: normalVector.z };
			config.subGlobuleConfigs[sgIndex].transforms[tIndex].reflect = { anchor, normal };
			store.set(config);
		}

		interactionMode.set({ type: 'standard' });
	};

	const updateStore = (normal: Point3, anchor: Point3, recurs: RecombinatoryRecurrence[]) => {
		const config = get(store);
		const tx = config.subGlobuleConfigs[sgIndex].transforms[tIndex];
		let changed = false;
		if (isUpdatableRecurs(tx)) {
			tx.recurs = recurs;
			changed = true;
		}
		if (isUpdatableAnchor(tx)) {
			tx.reflect.anchor = anchor;
			changed = true;
		}
		if (isUpdatableNormal(tx)) {
			tx.reflect.normal = normal;
			changed = true;
		}
		if (changed) {
			store.set(config);
		}
	};

	$effect(() => {
		updateStore(normal, anchor, recurs);
	});
</script>

<div class="reflect-card">
	{#if active}
		<div>
			<RecurrenceControl bind:recurs {sgIndex} {tIndex} />
			{#if isGlobuleTransformReflect($store.subGlobuleConfigs[sgIndex].transforms[tIndex])}
				<div>
					<PointInput label="Normal" constraint={{ length: 1 }} bind:value={normal} />
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
				<div>
					<PickPointsButton
						label="Pick Points for Plane"
						mode={{ type: 'point-select-plane', data: { pick: 3, points: [] }, onSelectPoint }}
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
				<span>Anchor: </span><span>{formatPoint3(anchor, 2)}</span>
			</div>
			<div>
				<span>Normal: </span><span>{formatPoint3(normal, 2)}</span>
			</div>
		</button>
	{/if}
</div>

<style>
	.reflect-card {
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
