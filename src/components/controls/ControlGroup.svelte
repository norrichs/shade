<script lang="ts">
	import type { Snippet } from 'svelte';

	let { show = true, children }: { show?: boolean; children: Snippet } = $props();
</script>

<div class="control-group" style={`display: ${show ? 'grid' : 'none'};`}>{@render children()}</div>

<style>
	.control-group {
		margin: 4px;
		border-radius: 5px;
		padding: 10px;
		width: 400px;
		display: grid;
		grid-template-columns: 1fr 2fr;
	}
	.control-group input {
		width: 40px;
	}
	.control-group select {
		width: 120px;
	}
	.readout {
		margin: 0.5em;
		padding: 0.5em;
		border: 1px solid black;
		border-radius: 8px;
		background-color: aliceblue;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.75em;
	}
</style>
