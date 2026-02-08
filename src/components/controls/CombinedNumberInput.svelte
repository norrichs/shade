<script lang="ts">
	let {
		show = true,
		value = $bindable(),
		label,
		min = 0,
		max = 1,
		step = 0.1
	}: {
		show?: boolean;
		value: number;
		label: string;
		min?: number;
		max?: number;
		step?: number;
	} = $props();
</script>

{#if show}
	<div class="row">
		<span>{label}</span>
		<input type="number" {min} {max} {step} bind:value />
		<input type="range" {min} {max} {step} bind:value />
	</div>
{/if}

<style>
	.row {
		width: 300px;
		display: flex;
		flex-direction: row;
		gap: 10px;
		padding: 5px;
		border: 1px solid black;
		border-radius: 3px;
		margin: 5px;
	}
</style>
