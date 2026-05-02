<script lang="ts">
	import type { UnitDefinition } from '$lib/patterns/spec-types';
	import type { PathSegment } from '$lib/types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import { getCanvas, type PathEditorConfig } from './path-editor-shared';
	import { computeVertices, updateUnitForVertexMove, type Vertex } from './segment-vertices';
	import DraggablePoint from './DraggablePoint.svelte';

	let {
		unit,
		config,
		onChangeUnit
	}: {
		unit: UnitDefinition;
		config: PathEditorConfig;
		onChangeUnit: (unit: UnitDefinition) => void;
	} = $props();

	const canv = $derived(getCanvas(config));
	const vertices = $derived(computeVertices(unit));
	const allSegments = $derived<PathSegment[]>([...unit.start, ...unit.middle, ...unit.end]);
	const pathString = $derived(svgPathStringFromSegments(allSegments));

	const handleDrag = (vertex: Vertex, newX: number, newY: number) => {
		const scaledX = newX * canv.scale;
		const scaledY = newY * canv.scale;
		onChangeUnit(updateUnitForVertexMove(unit, vertex, scaledX, scaledY));
	};

	const handleDragEnd = () => {
		// Updates flow on every drag tick; nothing to commit on end
	};
</script>

<div class="container">
	<svg width={config.size.width} height={config.size.height} viewBox={canv.viewBox} class="canvas">
		<rect x="0" y="0" width={unit.width} height={unit.height} class="unit-bounds" />
		<path d={pathString} class="segments" />
	</svg>
	{#each vertices as vertex (vertex.x + ':' + vertex.y)}
		<DraggablePoint
			{config}
			{canv}
			curveIndex={0}
			pointIndex={0}
			point={{ type: 'PointConfig2', x: vertex.x, y: vertex.y }}
			handleDrag={(x, y) => handleDrag(vertex, x, y)}
			{handleDragEnd}
			handleDoubleClick={() => {}}
		/>
	{/each}
</div>

<style>
	.container {
		border: 1px dotted black;
		padding: 0;
		position: relative;
	}
	.canvas {
		background-color: beige;
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
</style>
