<script lang="ts">
	import type { ComponentType, SvelteComponent } from 'svelte';
	import HoverButton from './HoverButton.svelte';
	import Floater from './Floater.svelte';
	import CrossSection from './editor/CrossSection.svelte';
	import EdgeCurve from './editor/EdgeCurve.svelte';

	let showFloater = false;
	let currentFloater: FloaterContent | undefined = undefined;

	type FloaterContent = {
		shortTitle: string;
		title: string;
		content: ComponentType<SvelteComponent>;
	};

	const floaters: Map<FloaterContent['title'], FloaterContent> = new Map([
		[
			'Cross Sections',
			{
				shortTitle: 'CS',
				title: 'Cross Section',
				content: CrossSection
			}
		],
		[
			`Edge Curves`,
			{
				shortTitle: 'Edge',
				title: 'Edge Curve',
				content: EdgeCurve
			}
		]
	]);

	const toggleFloater = (floater?: FloaterContent['title']) => {
		console.debug('toggleFloater', floater, floaters);
		if (!floater) {
			showFloater = false;
			currentFloater = undefined;
		} else if (!currentFloater) {
			showFloater = true;
			currentFloater = floaters.get(floater);
		} else if (currentFloater && floater === currentFloater.title) {
			showFloater = false;
			currentFloater = undefined;
		} else if (currentFloater && floater !== currentFloater.title) {
			showFloater = true;
			currentFloater = floaters.get(floater);
		}
	};
</script>

<nav>
	<div class="hover-button-container">
		{#each floaters as [title, floater]}
			<HoverButton
				onClick={() => toggleFloater(title)}
				shortTitle={floater.shortTitle}
				mainTitle={title}
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
