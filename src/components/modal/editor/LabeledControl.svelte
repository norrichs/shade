<script lang="ts">
	export let label: string;
	export let show = true;
</script>

{#if show}
	<div class="labeled-control">
		<div>{label}</div>
		<slot />
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
