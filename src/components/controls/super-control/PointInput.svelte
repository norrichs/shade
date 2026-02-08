<script lang="ts">
	import { untrack } from 'svelte';
	import type { Point3 } from '$lib/types';
	import { Vector3 } from 'three';
	import NumberInput from './NumberInput.svelte';

	type VectorConstraint = { length: number } | undefined; //| { direction: Point3 };

	let { label = '', constraint = undefined, value = $bindable() }: {
		label?: string;
		constraint?: VectorConstraint;
		value: Point3;
	} = $props();

	let x = $state(value.x);
	let y = $state(value.y);
	let z = $state(value.z);

	// Sync prop → local only when the PROP changes (parent pushed a new value).
	// Reading x/y/z inside untrack() prevents this effect from re-running
	// when local state changes, which would revert user input.
	$effect.pre(() => {
		const vx = value.x, vy = value.y, vz = value.z;
		untrack(() => {
			if (vx !== x) x = vx;
			if (vy !== y) y = vy;
			if (vz !== z) z = vz;
		});
	});

	// Sync local → prop when user edits x/y/z
	$effect(() => {
		if (value.x !== x || value.y !== y || value.z !== z) {
			if (constraint?.length) {
				const newVector = new Vector3(x, y, z);
				newVector.setLength(constraint.length);
				value = { x: newVector.x, y: newVector.y, z: newVector.z };
				x = newVector.x;
				y = newVector.y;
				z = newVector.z;
			} else {
				value = { x, y, z };
			}
		}
	});
</script>

<div class="container">
	<div>{label}</div>
	<NumberInput bind:value={x} min={-500} max={500} />
	<NumberInput bind:value={y} min={-500} max={500} />
	<NumberInput bind:value={z} min={-500} max={500} />
</div>

<style>
	.container {
		display: flex;
		flex-direction: row;
		gap: 4px;
	}
</style>
