<script lang="ts">
	import HoverButton from './HoverButton.svelte';
	import Floater from './Floater.svelte';
	import type { FloaterContent, SidebarDefinition } from './sidebar-definitions';

	export let sidebarDefinition: SidebarDefinition;
	
	let showFloater = false;
	let currentFloater: FloaterContent | undefined = undefined;



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

<nav>
	<div class="hover-button-container">
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
		background-color: transparent;
		position: fixed;
		top: 0;
		right: 0;
		height: 100%;
		width: 30px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
	}
	.hover-button-container {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
		gap: 10px;
    transform: translateX(90%);
	}
  nav:hover > .hover-button-container {
    transform: translateX(0);
    transition: transform 0.2s ease-in
  }
</style>
