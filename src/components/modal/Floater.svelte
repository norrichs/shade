<script lang="ts">
	import type { Component } from 'svelte';
	import Button from '../design-system/Button.svelte';

	let { onClose, title, showFloater, content: Content }: {
		onClose: () => void;
		title: string | string[] | undefined;
		showFloater: boolean;
		content: Component | undefined;
	} = $props();

	function clickOutside(node: HTMLElement) {
		const handleClick = (event: MouseEvent) => {
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
