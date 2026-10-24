<script lang="ts">
	import { patternConfigStore, exportPagesStore } from '#lib/stores/index.js';
	import { buildPageGeom } from '#lib/cut-pattern/page-layout/registry.js';
	import {
		currentPageIndex,
		steppedPageIndex,
		zoomToFitWidth
	} from '#lib/cut-pattern/pattern-view-navigation.js';
	import { FiChevronRight, FiChevronLeft, FiMaximize } from 'svelte-icons-pack/fi';
	import { Icon } from 'svelte-icons-pack';

	let { onNavigate }: { onNavigate?: () => void } = $props();

	let pages = $derived($exportPagesStore?.pages ?? []);
	let current = $derived(
		currentPageIndex(pages, $patternConfigStore.patternViewConfig.centerOffset)
	);

	// Outside page layout mode there are no page rects, so size against the
	// configured page instead.
	const pageWidth = () => {
		if (current >= 0) return pages[current].width;
		const layout = $patternConfigStore.patternConfig.pageLayout;
		return layout ? buildPageGeom(layout).pageWidth : $patternConfigStore.patternConfig.page.width;
	};

	const zoomToPage = () => {
		const { page } = $patternConfigStore.patternConfig;
		$patternConfigStore.patternViewConfig.zoom = zoomToFitWidth(pageWidth(), page.width, page.unit);
		$patternConfigStore.patternViewConfig.centerOffset.x = current >= 0 ? pages[current].x : 0;
		onNavigate?.();
	};

	const goToPage = (step: -1 | 1) => {
		const i = steppedPageIndex(pages, $patternConfigStore.patternViewConfig.centerOffset, step);
		if (i < 0) return;
		$patternConfigStore.patternViewConfig.centerOffset = { x: pages[i].x, y: pages[i].y };
		onNavigate?.();
	};
</script>

<div class="page-nav">
	<button onclick={zoomToPage} title="Zoom to fit one page width">
		<Icon size={16} src={FiMaximize} />
		<span>Zoom to page</span>
	</button>
	<button onclick={() => goToPage(-1)} disabled={current <= 0} title="Previous page">
		<Icon size={18} src={FiChevronLeft} />
	</button>
	<span class="page-count">
		{#if pages.length}
			page {current + 1} / {pages.length}
		{:else}
			no pages
		{/if}
	</span>
	<button
		onclick={() => goToPage(1)}
		disabled={current < 0 || current >= pages.length - 1}
		title="Next page"
	>
		<Icon size={18} src={FiChevronRight} />
	</button>
</div>

<style>
	.page-nav {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		margin-bottom: 6px;
	}
	.page-nav button {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.page-count {
		min-width: 6em;
		text-align: center;
	}
</style>
