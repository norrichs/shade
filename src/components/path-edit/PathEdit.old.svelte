<script context="module">
	// import  DragDropTouch  from 'svelte-drag-drop-touch'
	import { asDraggable } from 'svelte-drag-and-drop-actions';
</script>

<script lang="ts">
	import type { BezierConfig } from '../../lib/rotated-shape';
	import { curveConfig } from "../../lib/stores"
	
  
  

	function onDragMove_0(x: number, y: number) {
		$curveConfig.p0.x = x / 4;
		$curveConfig.p0.y = y / 4;
	}
	function onDragMove_1(x: number, y: number) {
		$curveConfig.p1.x = x / 4;
		$curveConfig.p1.y = y / 4;
	}
	function onDragMove_2(x: number, y: number) {
		$curveConfig.p2.x = x / 4;
		$curveConfig.p2.y = y / 4;
	}
	function onDragMove_3(x: number, y: number) {
		$curveConfig.p3.x = x / 4;
		$curveConfig.p3.y = y / 4;
	}
</script>

<p style="line-height:150%">
	Drag any handle around - dragging should be restricted to the bordered area:
</p>

<div
	style="
  display:block; position:relative;
  width:400px; height:400px;
  margin:20px;
  border:dotted 1px black; border-radius:4px;
"
>
	<svg viewBox="-50 -50 100 100" style="overflow:visible">
		<path
			d="M {$curveConfig.p0.x} {$curveConfig.p0.y} C {$curveConfig.p1.x} {$curveConfig.p1.y}, {$curveConfig.p2.x} {$curveConfig.p2.y}, {$curveConfig.p3.x} {$curveConfig.p3.y}"
			stroke="black"
			stroke-width="2"
			fill="transparent"
		/>
		<line x1={$curveConfig.p0.x} y1={$curveConfig.p0.y} x2={$curveConfig.p1.x} y2={$curveConfig.p1.y} stroke="red" stroke-width="2" />
		<line x1={$curveConfig.p2.x} y1={$curveConfig.p2.y} x2={$curveConfig.p3.x} y2={$curveConfig.p3.y} stroke="red" stroke-width="2" />
	</svg>

	<div>
		{`(${$curveConfig.p0.x}, ${$curveConfig.p0.y}) (${$curveConfig.p1.x}, ${$curveConfig.p1.y}) (${$curveConfig.p2.x}, ${$curveConfig.p2.y}) (${$curveConfig.p3.x}, ${$curveConfig.p3.y}) `}
	</div>

	<div
		class="Handle"
		style="left:{$curveConfig.p0.x * 4 + 195}px; top:{$curveConfig.p0.y * 4 + 195}px"
		use:asDraggable={{
			onDragStart: { x: $curveConfig.p0.x * 4, y: $curveConfig.p0.y * 4 },
			onDragMove: onDragMove_0,
			minX: -200,
			minY: -200,
			maxX: 200,
			maxY: 200 
		}}
	/>
	<div
		class="Handle"
		style="left:{$curveConfig.p1.x * 4 + 195}px; top:{$curveConfig.p1.y * 4 + 195}px"
		use:asDraggable={{
			onDragStart: { x: $curveConfig.p1.x * 4, y: $curveConfig.p1.y * 4 },
			onDragMove: onDragMove_1,
			minX: -200,
			minY: -200,
			maxX: 200,
			maxY: 200 
		}}
	/>
	<div
		class="Handle"
		style="left:{$curveConfig.p2.x * 4 + 195}px; top:{$curveConfig.p2.y * 4 + 195}px"
		use:asDraggable={{
			onDragStart: { x: $curveConfig.p2.x*4, y: $curveConfig.p2.y * 4 },
			onDragMove: onDragMove_2,
			minX: -200,
			minY: -200,
			maxX: 200,
			maxY: 200 
		}}
	/>
	<div
		class="Handle"
		style="left:{$curveConfig.p3.x * 4 + 195}px; top:{$curveConfig.p3.y * 4 + 195}px"
		use:asDraggable={{
			onDragStart: { x: $curveConfig.p3.x * 4, y: $curveConfig.p3.y * 4 },
			onDragMove: onDragMove_3,
			minX: -200,
			minY: -200,
			maxX: 200,
			maxY: 200 
		}}
	/>
</div>

<!-- From: https://svelte.dev/repl/e9c64887e2684146acdc16e9af13193e?version=3.55.1 -->
<style>
	:global([draggable]) {
		-webkit-touch-callout: none;
		-ms-touch-action: none;
		touch-action: none;
		-moz-user-select: none;
		-webkit-user-select: none;
		-ms-user-select: none;
		user-select: none;
	}

	.Handle {
		display: block;
		position: absolute;
		width: 8px;
		height: 8px;
		border: solid 1px black;
		background: yellow;
		cursor: move;
	}
</style>
