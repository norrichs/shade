<script lang="ts">
	import type { ComponentType, SvelteComponent } from 'svelte';
	import Button from '../design-system/Button.svelte';

	export let onClose: () => void;
	export let title: string | string[] | undefined;
	export let showFloater: boolean;
	export let content: ComponentType<SvelteComponent> | undefined;
</script>

{#if showFloater}
	<main>
		<header>
			<span>{title}</span>
			<Button on:click={() => onClose()}>X</Button>
		</header>
		<svelte:component this={content} />
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
