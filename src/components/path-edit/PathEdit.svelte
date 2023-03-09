<script context="module">
	// import  DragDropTouch  from 'svelte-drag-drop-touch'
	import { asDraggable } from 'svelte-drag-and-drop-actions';
</script>

<script lang="ts">
	import type { BezierConfig } from '../../lib/rotated-shape';
	import { isBezierCurveConfig } from '../../lib/rotated-shape';
	import { curveConfig } from "../../lib/stores"

	const canv = {
		minX: 0,
		minY: 0,
		maxX: 100,
		maxY: 100,
	}

	

	const onDragMove = (
		x: number,
		y: number,
		curveIndex: number,
		pointIndex: number,
	) => {
		const curve = $curveConfig.curves[curveIndex]
		
		if (curve.type === "BezierConfig") {
			console.debug(`onDragMove curve:${curveIndex} point:${pointIndex}`)
			curve.points[pointIndex].x = x / 4
			curve.points[pointIndex].y = y / 4
			$curveConfig.curves[curveIndex] = curve
			// $curveConfig = {...$curveConfig, curves: [
			// 	...$curveConfig.curves.slice(0, curveIndex),
			// 	curve,
			// 	...$curveConfig.curves.slice(curveIndex + 1)
			// ]}
		}

	}

</script>

<div
	style="
  display:block; position:relative;
  width:400px; height:400px;
  margin:20px;
  border:dotted 1px black; border-radius:4px;
"
>
	<svg viewBox={`${canv.minX} ${canv.minY} ${canv.maxX - canv.minX} ${canv.maxY - canv.minY}`} style="overflow:visible">
		{#each $curveConfig.curves as c}
			{#if c.type === "BezierConfig"}
				<circle cx="0" cy="0" r="2" />
				<path
					d="M {c.points[0].x} {c.points[0].y} C {c.points[1].x} {c.points[1].y}, {c.points[2].x} {c.points[2].y}, {c.points[3].x} {c.points[3].y}"
					stroke="black"
					stroke-width="1"
					fill="transparent"
				/>
				<line x1={c.points[0].x} y1={c.points[0].y} x2={c.points[1].x} y2={c.points[1].y} stroke="red" stroke-width=".5" />
				<line x1={c.points[2].x} y1={c.points[2].y} x2={c.points[3].x} y2={c.points[3].y} stroke="red" stroke-width=".5" />
			{/if}
		{/each}
	</svg>

	<!-- <div>
		{`(${$curveConfig.p0.x}, ${$curveConfig.p0.y}) (${$curveConfig.p1.x}, ${$curveConfig.p1.y}) (${$curveConfig.p2.x}, ${$curveConfig.p2.y}) (${$curveConfig.p3.x}, ${$curveConfig.p3.y}) `}
	</div> -->

	{#each $curveConfig.curves as curve, curveIndex}
		{#if curve.type === "BezierConfig"}
			{#each curve.points as point, p}
				<div
					class="Handle"
					style="left:{point.x * 4}px; top:{point.y * 4}px"
					use:asDraggable={{
						onDragStart: { x: point.x * 4, y: point.y * 4 },
						onDragMove: (x, y) => onDragMove(x, y, curveIndex, p),
						minX: -200,
						minY: -200,
						maxX: 200,
						maxY: 200 
					}}
				/>
			{/each}

		{/if}
	{/each}
</div> 


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
