<script lang="ts">
	import HoverButton from './HoverButton.svelte';
	import Floater from './Floater.svelte';
	import type { FloaterContent, SidebarDefinition } from './sidebar-definitions';
	import Button from '../design-system/Button.svelte';

	let { sidebarDefinition }: { sidebarDefinition: SidebarDefinition } = $props();

	let showFloater = $state(false);
	let currentFloater: FloaterContent | undefined = $state(undefined);
	let showMode: 'onHover' | 'always' = $state('always');

	const toggleFloater = (floater?: FloaterContent['title']) => {
		if (!floater) {
			showFloater = false;
			currentFloater = undefined;
		} else if (!currentFloater) {
			showFloater = true;
			currentFloater = sidebarDefinition.get(floater);
		} else if (currentFloater && floater === currentFloater.title) {
			showFloater = false;
			currentFloater = undefined;
		} else if (currentFloater && floater !== currentFloater.title) {
			showFloater = true;
			currentFloater = sidebarDefinition.get(floater);
		}
	};
</script>

<nav class={showMode === 'onHover' ? 'show-on-hover' : 'show-always'}>
	<div class="hover-button-container">
		<Button onclick={() => (showMode = showMode === 'onHover' ? 'always' : 'onHover')}
			>{showMode}</Button
		>
		{#each sidebarDefinition as [title, floater]}
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
