<script lang="ts">
	import HoverButton from './HoverButton.svelte';
	import Floater from './Floater.svelte';
	import type { FloaterContent, SidebarDefinition } from './sidebar-definitions';
	import Button from '../design-system/Button.svelte';
	import { openSidebarPanel } from '#lib/stores/sidebarStore.js';

	let { sidebarDefinition }: { sidebarDefinition: SidebarDefinition } = $props();

	// The open panel lives in a store so the agent bridge can open panels too.
	const currentFloater: FloaterContent | undefined = $derived(
		$openSidebarPanel ? sidebarDefinition.get($openSidebarPanel) : undefined
	);
	const showFloater = $derived(currentFloater !== undefined);
	let showMode: 'onHover' | 'always' = $state('always');

	$effect(() => () => openSidebarPanel.set(null));

	const toggleFloater = (floater?: FloaterContent['title']) => {
		openSidebarPanel.set(!floater || floater === $openSidebarPanel ? null : floater);
	};
</script>

<nav class={showMode === 'onHover' ? 'show-on-hover' : 'show-always'}>
	<div class="hover-button-container">
		<Button onclick={() => (showMode = showMode === 'onHover' ? 'always' : 'onHover')}
			>{showMode}</Button
		>
		{#each sidebarDefinition as [title, floater] (title)}
			<HoverButton
				onClick={() => toggleFloater(title)}
				shortTitle={floater.shortTitle}
				mainTitle={floater.title}
			/>
		{/each}
	</div>
</nav>

<Floater
	{showFloater}
	onClose={toggleFloater}
	title={currentFloater?.title}
	content={currentFloater?.content}
	closeOnClickAway={currentFloater?.closeOnClickAway ?? false}
/>

<style>
	nav {
		background-color: rgba(0, 0, 0, 0.1);
		position: fixed;
		top: 50px;
		right: 0px;
		bottom: 0px;
		height: 100%;
		width: 30px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
	}
	nav.show-always > .hover-button-container {
		transform: translateX(0);
	}
	.hover-button-container {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
		gap: 10px;
		transform: translateX(90%);
	}
	nav.show-on-hover:hover > .hover-button-container {
		transform: translateX(0);
		transition: transform 0.2s ease-in;
	}
</style>
