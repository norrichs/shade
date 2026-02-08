<script lang="ts">
	import type { Snippet } from 'svelte';

	let { menuName, children }: { menuName: string; children: Snippet } = $props();
</script>

<div popover="auto" id={menuName} class="popover-menu">
	{@render children()}
</div>

<style>
	.popover-menu:popover-open {
		all: inherit;
		left: 350px;
		top: 55px;
		background-color: antiquewhite;
		padding: 30px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		border-radius: 5px;
		border: 1px solid black;
		box-shadow: 0 0 10px -3px black;
	}
</style>
