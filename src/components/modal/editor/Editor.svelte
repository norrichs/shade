<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<main>
	{@render children()}
</main>

<style>
	:root {
		font-family: monospace;
	}
	:global(section) {
		border: 1px dotted black;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	:global(section > header) {
		background-color: rgba(0, 0, 0, 0.1);
		padding: 4px;
		font-size: 1em;
	}
	:global(section > div) {
		display: flex;
		flex-direction: row;
	}
	:global(section > div > div) {
		padding: 10px;
	}
</style>
