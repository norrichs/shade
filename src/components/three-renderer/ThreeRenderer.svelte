<script lang="ts">
	import { Canvas } from '@threlte/core';
	import PointPick from './PointPick.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="container">
	<PointPick />
	<Canvas>
		{@render children()}
	</Canvas>
</div>

<style>
	.container {
		position: relative;
		border: 1px solid grey;
		background-color: beige;
		height: 100%;
	}
</style>
