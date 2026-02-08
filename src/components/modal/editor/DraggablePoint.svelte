<script lang="ts" context="module">
	// @ts-ignore
	import { asDraggable } from 'svelte-drag-and-drop-actions';
	import { getPointClass, type PathEditorCanvas, type PathEditorConfig } from './path-editor';
	import type { PointConfig2 } from '$lib/types';
</script>

<script lang="ts">
	let {
		config,
		canv,
		curveIndex,
		pointIndex,
		point,
		handleDragEnd,
		handleDoubleClick,
		handleDrag
	}: {
		config: PathEditorConfig;
		canv: PathEditorCanvas;
		curveIndex: number;
		pointIndex: number;
		point: PointConfig2;
		handleDragEnd: () => void;
		handleDoubleClick: () => void;
		handleDrag: (x: number, y: number) => void;
	} = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class={`point ${getPointClass(curveIndex, pointIndex)}`}
	style={`left:${(-canv.minX - config.gutter + point.x) / canv.scale}px; top:${
		(-canv.minY - config.gutter + point.y) / canv.scale
	}px`}
	ondragend={handleDragEnd}
	ondblclick={handleDoubleClick}
	use:asDraggable={{
		onDragStart: { x: point.x / canv.scale, y: point.y / canv.scale },
		onDragMove: handleDrag,
		minX: canv.minX / canv.scale,
		minY: canv.minY / canv.scale,
		maxX: canv.maxX / canv.scale,
		maxY: canv.maxY / canv.scale
	}}
/>

<style>
	:root {
		--point-size: 8px;
	}
	.point {
		padding: 0;
		position: absolute;
		width: var(--point-size);
		height: var(--point-size);
		transform: translate(-50%, -50%);
		cursor: move;
	}
	.anchor {
		background-color: transparent;
		border: 1px solid rgba(0, 0, 0, 0.7);
	}
	.direction {
		background-color: rgba(200, 200, 255, 1);
		border-radius: 50%;
	}
</style>
