<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, show = true, children }: { label: string; show?: boolean; children: Snippet } =
		$props();
</script>

{#if show}
	<div class="labeled-control">
		<div>{label}</div>
		{@render children()}
	</div>
{/if}

<style>
	.labeled-control {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
</style>
