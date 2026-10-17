<script lang="ts">
	import { Canvas } from '@threlte/core';
	import PointPick from './PointPick.svelte';
	import AgentCapture from './AgentCapture.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="container">
	<PointPick />
	<Canvas>
		<AgentCapture />
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
	/* Threlte's canvas wrapper. Editor.svelte's global `section > div > div { padding:
	   10px }` reaches it through designer2's `section > div.container`, insetting the
	   canvas 10px — but Threlte computes pointer rays from the wrapper's offsets and
	   size, so every click (measure points, band picks) raycast off the cursor. */
	.container > :global(div) {
		padding: 0;
	}
</style>
