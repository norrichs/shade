<script lang="ts">
	import type { Point3 } from '$lib/types';
	import { Vector3 } from 'three';
	import NumberInput from './NumberInput.svelte';

	type VectorConstraint = { length: number } | undefined; //| { direction: Point3 };

	export let label: string = '';
	export let constraint: VectorConstraint = undefined;
		
	export let value: Point3;


	let { x, y, z } = value;

	const updateValue = (x: number, y: number, z: number) => {
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
	};

	$: updateValue(x, y, z);
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
