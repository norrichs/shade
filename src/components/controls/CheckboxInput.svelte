<script lang="ts">
	export let show = true;
	export let value: boolean;
	export let label: string;
</script>

{#if show}
	<div>
		<span>{label}</span>
		<input type="checkbox" bind:checked={value} />
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
