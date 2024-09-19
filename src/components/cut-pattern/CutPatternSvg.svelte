<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import type { PatternViewConfig } from '$lib/types';

	const getViewBox = (config: PatternViewConfig) => {
		const { width, height, zoom, centerOffset } = config;
		const minX = 0;
		const minY = 0;
		const logZoom = 1 / Math.pow(10, zoom);
		const viewBox = `${minX} ${minY} ${$patternConfigStore.patternConfig.page.width * logZoom} ${
			$patternConfigStore.patternConfig.page.height * logZoom
		}`;
		return viewBox;
	};

	$: viewBoxValue = getViewBox($patternConfigStore.patternViewConfig);
</script>

<svg id="outer-svg" width="100%" height="100%" viewBox={viewBoxValue}>
	<svg
		id="pattern-svg"
		height={`${2000}${$patternConfigStore.patternConfig.page.unit}`}
		width={`${2000}${$patternConfigStore.patternConfig.page.unit}`}
		viewBox={`${
			$patternConfigStore.patternViewConfig.centerOffset.x -
			$patternConfigStore.patternConfig.page.width
		} ${
			$patternConfigStore.patternViewConfig.centerOffset.y -
			$patternConfigStore.patternConfig.page.height
		} ${2000} ${2000}`}
	>
		<slot />
	</svg>
</svg>
