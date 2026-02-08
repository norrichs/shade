<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		variant = 'standard',
		class: className = '',
		disabled = false,
		children,
		...restProps
	}: HTMLButtonAttributes & {
		variant?: 'standard' | 'link';
		children?: Snippet;
	} = $props();
</script>

<button {...restProps} class="{variant} {className}" {disabled} class:disabled>
	{#if children}
		{@render children()}
	{/if}
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
