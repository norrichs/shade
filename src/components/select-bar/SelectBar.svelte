<script lang="ts">
	import type { SelectBarOption } from '$lib/types';

	export let options: SelectBarOption[];
	let selected: string;
	export let value: unknown;

	$: {
		value = options.find((option) => option.name === selected);
	}
</script>

<div class="multi-button">
	{#each options as option}
		<button
			class:selected={selected === option.name}
			on:click={() => {
				selected = option.name;
			}}
		>
			{option.name}
		</button>
	{/each}
</div>

<style>
	.multi-button {
		margin: 4px;
		display: flex;
		flex-direction: row;
		border-radius: 4px;
	}
	.multi-button button {
		border: 0;
		padding: 5px;
		background-color: var(--color-dark);
		color: var(--color-link);
		transition: 200ms;
	}
	.multi-button button:first-of-type {
		border-radius: 4px 0 0 4px;
	}
	.multi-button button:last-of-type {
		border-radius: 0 4px 4px 0;
	}
	.multi-button .selected {
		background-color: var(--color-highlight);
		color: black;
		transition: 200ms;
	}
</style>
