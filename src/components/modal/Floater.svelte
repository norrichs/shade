<script lang="ts">
	import type { Component } from 'svelte';
	import Button from '../design-system/Button.svelte';

	let {
		onClose,
		title,
		showFloater,
		content: Content,
		closeOnClickAway = false
	}: {
		onClose: () => void;
		title: string | string[] | undefined;
		showFloater: boolean;
		content: Component | undefined;
		/**
		 * Floaters stay open on click-away by default. Opt in to click-away
		 * closing only for panels that are genuinely transient.
		 */
		closeOnClickAway?: boolean;
	} = $props();

	// One `<main>`, one action. The action reads `closeOnClickAway` at event time
	// rather than being conditionally applied, so toggling the flag never forces
	// the panel to remount (which would tear down its content).
	function clickOutside(node: HTMLElement) {
		const handleClick = (event: MouseEvent) => {
			if (!closeOnClickAway) return;
			if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
				onClose();
			}
		};

		document.addEventListener('click', handleClick, true);

		return {
			destroy() {
				document.removeEventListener('click', handleClick, true);
			}
		};
	}
</script>

{#if showFloater}
	<main use:clickOutside>
		<header>
			<span>{title}</span>
			<Button onclick={() => onClose()}>X</Button>
		</header>
		{#if Content}<Content />{/if}
	</main>
{/if}

<style>
	header {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		gap: 100px;
	}
	main {
		padding: 10px;
		position: fixed;
		top: 100px;
		right: 20px;
		background-color: aliceblue;
		box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.5);
	}
</style>
