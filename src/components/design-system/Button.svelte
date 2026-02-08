<script lang="ts">
	export let variant: 'standard' | 'link' = 'standard';
	export let disabled: boolean = false;

	// Accept class prop from parent
	let className = '';
	export { className as class };
</script>

<button on:click on:mousedown on:mouseup class="{variant} {className}" {disabled} class:disabled>
	<slot />
</button>

<style>
	.standard {
		background-color: var(--color-active);
		outline: none;
		border: none;
		border-radius: 4px;
		padding: 6px 10px;
		box-shadow: 2px 2px 10px 0px var(--color-shaded-dark);
	}

	.standard:disabled,
	.standard.disabled {
		opacity: 0.5;
		cursor: not-allowed;
		pointer-events: none;
	}
</style>
