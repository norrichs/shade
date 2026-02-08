<script lang="ts" context="module">
	// @ts-ignore
	import { asDraggable } from 'svelte-drag-and-drop-actions';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { BezierConfig, PointConfig2 } from '$lib/types';
	import Button from '../../design-system/Button.svelte';
	import CurveDefPath from './CurveDefPath.svelte';
	import { getCanvas, applyLimits, type LimitFunction, type PathEditorConfig } from './path-editor';
	import DirectionLines from './DirectionLines.svelte';
	import DraggablePoint from './DraggablePoint.svelte';

	let {
		curveDef,
		config,
		onChangeCurveDef,
		manualUpdate = false,
		limits = [],
		children
	}: {
		curveDef: BezierConfig[];
		config: PathEditorConfig;
		onChangeCurveDef: (curveDef: BezierConfig[]) => void;
		manualUpdate?: boolean;
		limits?: LimitFunction[];
		children?: Snippet;
	} = $props();

	const handleDragEnd = () => {
		if (onChangeCurveDef && !manualUpdate) {
			onChangeCurveDef(curveDef);
		}
	};

	const handleUpdateCurveDef = (newCurveDef: BezierConfig[]) => {
		curveDef = newCurveDef;
		onChangeCurveDef(curveDef);
	};

	const handleDoubleClick = () => {
		console.debug('handleDoubleClick');
	};

	const handleDrag = (newX: number, newY: number, curveIndex: number, pointIndex: number) => {
		const scaledPoint = {
			type: 'PointConfig2',
			x: newX * canv.scale,
			y: newY * canv.scale
		} as PointConfig2;
		if (!limits || limits.length === 0) {
			curveDef[curveIndex].points[pointIndex] = scaledPoint;
			curveDef = curveDef;
			return;
		}
		curveDef = applyLimits({
			limits,
			curveDef,
			curveIndex,
			pointIndex,
			newPoint: scaledPoint,
			oldPoint: { ...curveDef[curveIndex].points[pointIndex] }
		});
	};

	let canv = $derived(getCanvas(config));
</script>

<div class="container">
	<svg width={config.size.width} height={config.size.height} viewBox={canv.viewBox} class="canvas">
		<CurveDefPath {curveDef} {canv} onChangeCurveDef={handleUpdateCurveDef} />
		<DirectionLines {curveDef} canvScale={canv.scale} />
		{@render children?.()}
	</svg>
	{#each curveDef as curve, curveIndex}
		{#each curve.points as point, pointIndex}
			<DraggablePoint
				{config}
				{canv}
				{curveIndex}
				{pointIndex}
				{point}
				{handleDragEnd}
				{handleDoubleClick}
				handleDrag={(x, y) => handleDrag(x, y, curveIndex, pointIndex)}
			/>
		{/each}
	{/each}

	<div class="controls">
		{#if manualUpdate && onChangeCurveDef}
			<Button onclick={() => onChangeCurveDef(curveDef)}>Update</Button>
		{/if}
	</div>
</div>

<style>
	.canvas {
		background-color: beige;
	}

	.center-circle {
		fill: none;
		stroke: rgba(0, 0, 0, 0.2);
		stroke-width: 0.01px;
	}
	.container {
		border: 1px dotted black;
		padding: 0;
		position: relative;
	}
</style>
