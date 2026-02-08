<script lang="ts">
	import type { Snippet } from 'svelte';

	let { direction = 'row', children }: { direction?: 'row' | 'column'; children: Snippet } =
		$props();
</script>

<div class={direction === 'row' ? 'rows' : 'columns'}>
	{@render children()}
</div>

<style>
	div {
		display: flex;
	}

	.rows {
		flex-direction: row;
		gap: 20px;
	}

	.columns {
		flex-direction: column;
	}
</style>
