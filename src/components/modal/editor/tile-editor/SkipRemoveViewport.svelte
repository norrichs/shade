<script lang="ts">
	import type { TiledPatternSpec } from '$lib/patterns/spec-types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import { getCanvas, type PathEditorConfig } from '../path-editor-shared';
	import { computeVertices, type Vertex } from '../segment-vertices';
	import { flatIndexes } from '../vertex-addressing';

	let {
		spec,
		config,
		onToggleVertex
	}: {
		spec: TiledPatternSpec;
		config: PathEditorConfig;
		onToggleVertex: (vertex: Vertex) => void;
	} = $props();

	const canv = $derived(getCanvas(config));
	const vertices = $derived(computeVertices(spec.unit));
	const allSegments = $derived([...spec.unit.start, ...spec.unit.middle, ...spec.unit.end]);
	const pathString = $derived(svgPathStringFromSegments(allSegments));
	const skipSet = $derived(new Set(spec.adjustments.skipRemove));

	const isVertexSkipped = (vertex: Vertex): boolean =>
		flatIndexes(spec.unit, vertex).some((idx) => skipSet.has(idx));
</script>

<div class="container" style="width:{config.size.width}px; height:{config.size.height}px;">
	<svg width={config.size.width} height={config.size.height} viewBox={canv.viewBox} class="canvas">
		<rect x="0" y="0" width={spec.unit.width} height={spec.unit.height} class="unit-bounds" />
		<path d={pathString} class="segments" />

		{#each vertices as vertex (vertex.x + ':' + vertex.y)}
			{@const skipped = isVertexSkipped(vertex)}
			<circle
				cx={vertex.x}
				cy={vertex.y}
				r="0.7"
				class:skipped
				class="vertex"
				onclick={() => onToggleVertex(vertex)}
			/>
		{/each}
	</svg>
</div>

<style>
	.container {
		border: 1px dotted black;
		padding: 0;
		position: relative;
		box-sizing: content-box;
		flex: none;
	}
	.canvas {
		background-color: beige;
		display: block;
	}
	.unit-bounds {
		fill: none;
		stroke: rgba(0, 0, 0, 0.15);
		stroke-width: 0.2;
		stroke-dasharray: 0.5, 0.5;
	}
	.segments {
		fill: none;
		stroke: black;
		stroke-width: 0.4;
	}
	.vertex {
		fill: white;
		stroke: black;
		stroke-width: 0.15;
		cursor: pointer;
	}
	.vertex.skipped {
		fill: rgba(255, 0, 0, 0.4);
		stroke: red;
		stroke-width: 0.3;
	}
</style>
