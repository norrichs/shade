<script lang="ts">
	export let show = true;
	export let value: number;
	export let label: string;
	export let min = 0;
	export let max = 1;
	export let step = 0.1;
	export let type: 'number' | 'range' | 'combined' = 'combined';
</script>

{#if show}
	<div class="row">
		<span>{label}</span>
		{#if type === 'number' || type === 'combined'}
			<input type="number" {min} {max} {step} bind:value />
		{/if}

		{#if type === 'range' || type === 'combined'}
			<input type="range" {min} {max} {step} bind:value />
		{/if}
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
