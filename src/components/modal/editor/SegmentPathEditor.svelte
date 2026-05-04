<script lang="ts">
	import type { UnitDefinition } from '$lib/patterns/spec-types';
	import type { PathSegment } from '$lib/types';
	import { svgPathStringFromSegments } from '$lib/patterns/utils';
	import { getCanvas, type PathEditorConfig } from './path-editor-shared';
	import { computeVertices, updateUnitForVertexMove, type Vertex } from './segment-vertices';
	import DraggablePoint from './DraggablePoint.svelte';
	import type { UnitTool } from './tile-editor/UnitToolbar.svelte';
	import UnitLabels from './tile-editor/UnitLabels.svelte';
	import { flatIndexes } from './vertex-addressing';

	let {
		unit,
		config,
		tool = 'drag',
		skipRemove = [],
		onChangeUnit,
		onAddVertex,
		onRemoveVertex,
		onToggleSkip
	}: {
		unit: UnitDefinition;
		config: PathEditorConfig;
		tool?: UnitTool;
		skipRemove?: number[];
		onChangeUnit: (unit: UnitDefinition) => void;
		onAddVertex?: (x: number, y: number) => void;
		onRemoveVertex?: (vertex: Vertex) => void;
		onToggleSkip?: (vertex: Vertex) => void;
	} = $props();

	const canv = $derived(getCanvas(config));
	const vertices = $derived(computeVertices(unit));
	const allSegments = $derived<PathSegment[]>([...unit.start, ...unit.middle, ...unit.end]);
	const pathString = $derived(svgPathStringFromSegments(allSegments));
	const skipSet = $derived(new Set(skipRemove));
	const isVertexSkipped = (v: Vertex): boolean => {
		const idxs = flatIndexes(unit, v);
		return idxs.every((i) => skipSet.has(i));
	};

	const handleDrag = (vertex: Vertex, newX: number, newY: number) => {
		if (tool !== 'drag') return;
		const scaledX = newX * canv.scale;
		const scaledY = newY * canv.scale;
		onChangeUnit(updateUnitForVertexMove(unit, vertex, scaledX, scaledY));
	};

	const handleDragEnd = () => {};

	const handleSvgClick = (e: MouseEvent) => {
		if (tool !== 'add' || !onAddVertex) return;
		const svg = e.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const screenX = e.clientX - rect.left;
		const screenY = e.clientY - rect.top;
		const vbX = (screenX / config.size.width) * canv.viewBoxData.width + canv.viewBoxData.left;
		const vbY = (screenY / config.size.height) * canv.viewBoxData.height + canv.viewBoxData.top;
		onAddVertex(vbX, vbY);
	};

	const handleVertexClick = (vertex: Vertex) => {
		if (tool === 'remove' && onRemoveVertex) onRemoveVertex(vertex);
	};
</script>

<div class="container" style="width:{config.size.width}px; height:{config.size.height}px;">
	<svg
		width={config.size.width}
		height={config.size.height}
		viewBox={canv.viewBox}
		class="canvas"
		class:add={tool === 'add'}
		class:remove={tool === 'remove'}
		onclick={handleSvgClick}
	>
		<rect x="0" y="0" width={unit.width} height={unit.height} class="unit-bounds" />
		<path d={pathString} class="segments" />
		<UnitLabels {unit} {vertices} placement="above" />
		{#if tool === 'remove'}
			{#each vertices.filter((v) => v.refs.length >= 2) as vertex (vertex.x + ':' + vertex.y)}
				<circle
					cx={vertex.x}
					cy={vertex.y}
					r="0.6"
					class="remove-target"
					onclick={(e) => {
						e.stopPropagation();
						handleVertexClick(vertex);
					}}
				/>
			{/each}
		{/if}
		{#if tool === 'skipRemove'}
			{#each vertices as v (v.x + ':' + v.y + ':skip')}
				<circle
					cx={v.x}
					cy={v.y}
					r="0.6"
					fill={isVertexSkipped(v) ? 'rgba(220, 0, 0, 0.6)' : 'white'}
					stroke={isVertexSkipped(v) ? 'rgb(160, 0, 0)' : 'rgb(80, 80, 80)'}
					stroke-width="0.15"
					style="cursor: pointer"
					onclick={(e) => {
						e.stopPropagation();
						onToggleSkip?.(v);
					}}
				/>
			{/each}
		{/if}
	</svg>
	{#if tool === 'drag'}
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
	{/if}
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
	.canvas.add {
		cursor: crosshair;
	}
	.canvas.remove {
		cursor: not-allowed;
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
	.remove-target {
		fill: rgba(255, 0, 0, 0.15);
		stroke: red;
		stroke-width: 0.2;
		cursor: pointer;
	}
	.remove-target:hover {
		fill: rgba(255, 0, 0, 0.5);
	}
</style>
