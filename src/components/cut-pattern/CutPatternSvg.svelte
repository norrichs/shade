<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import type { PatternViewConfig } from '$lib/types';

	export let width = 4000;
	export let height = 2000;

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

<svg id="outer-svg" viewBox={viewBoxValue}>
	<svg
		id="pattern-svg"
		height={`${height}${$patternConfigStore.patternConfig.page.unit}`}
		width={`${width}${$patternConfigStore.patternConfig.page.unit}`}
		viewBox={`${
			$patternConfigStore.patternViewConfig.centerOffset.x -
			$patternConfigStore.patternConfig.page.width
		} ${
			$patternConfigStore.patternViewConfig.centerOffset.y -
			$patternConfigStore.patternConfig.page.height
		} ${width} ${height}`}
	>	
	  <circle cx={0} cy={0} r={10} fill="red" />
		<slot />
	</svg>
</svg>
