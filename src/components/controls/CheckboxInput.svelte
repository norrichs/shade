<script lang="ts">
	let {
		show = true,
		value = $bindable(),
		label
	}: { show?: boolean; value: boolean; label: string } = $props();
</script>

{#if show}
	<div>
		<span>{label}</span>
		<input type="checkbox" bind:checked={value} />
	</div>
{/if}
