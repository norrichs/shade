<script lang="ts">
	import type { Snippet } from 'svelte';
	import { patternConfigStore } from '$lib/stores';
	import type { PatternViewConfig } from '$lib/types';

	let {
		width = 4000,
		height = 2000,
		children
	}: {
		width?: number;
		height?: number;
		children?: Snippet;
	} = $props();

	const getViewBox = (config: PatternViewConfig) => {
		const { zoom, centerOffset } = config;
		const minX = 0;
		const minY = 0;
		const logZoom = 1 / Math.pow(10, zoom);
		const viewBox = `${minX} ${minY} ${$patternConfigStore.patternConfig.page.width * logZoom} ${
			$patternConfigStore.patternConfig.page.height * logZoom
		}`;
		return viewBox;
	};

	let viewBoxValue = $derived(getViewBox($patternConfigStore.patternViewConfig));
</script>

<svg id="outer-svg" viewBox={viewBoxValue}>
	<svg
		id="pattern-svg"
		height={`${height}${$patternConfigStore.patternConfig.page.unit}`}
		width={`${width}${$patternConfigStore.patternConfig.page.unit}`}
		viewBox={`${$patternConfigStore.patternViewConfig.centerOffset.x} ${
			$patternConfigStore.patternViewConfig.centerOffset.y
		} ${width} ${height}`}
	>
		{@render children?.()}
	</svg>
</svg>
