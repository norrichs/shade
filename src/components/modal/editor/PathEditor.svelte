<script lang="ts" context="module">
	// @ts-ignore
	import { asDraggable } from 'svelte-drag-and-drop-actions';
</script>

<script lang="ts">
	import type { BezierConfig } from '$lib/types';
	import Button from '../../design-system/Button.svelte';
	import CurveDefPath from './CurveDefPath.svelte';
	import {
		getPointClass,
		getCanvas,
		applyLimits,
		type LimitFunction,
		type PathEditorConfig
	} from './path-editor';
	import DirectionLines from './DirectionLines.svelte';
	import DraggablePoint from './DraggablePoint.svelte';

	export let curveDef: BezierConfig[];
	export let config: PathEditorConfig;
	export let onChangeCurveDef: ((curveDef: BezierConfig[]) => void) | undefined = undefined;
	export let manualUpdate: boolean = false;
	export let limits: LimitFunction[] = [];

	const handleDragEnd = () => {
		if (onChangeCurveDef && !manualUpdate) {
			onChangeCurveDef(curveDef);
		}
	};

	const handleDoubleClick = () => {
		console.debug('handleDoubleClick');
	};

	const handleDrag = (newX: number, newY: number, curveIndex: number, pointIndex: number) => {
		const { x, y } = applyLimits({
			limits,
			curveDef,
			curveIndex,
			pointIndex,
			newPoint: { type: 'PointConfig2', x: newX, y: newY }
		});

		curveDef[curveIndex].points[pointIndex] = {
			type: 'PointConfig2',
			x: x * canv.scale,
			y: y * canv.scale
		};
	};

	$: canv = getCanvas(config);
</script>

<div class="container">
	<svg width={config.size.width} height={config.size.height} viewBox={canv.viewBox} class="canvas">
		<CurveDefPath {curveDef} />
		<DirectionLines {curveDef} canvScale={canv.scale} />
    <slot />
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
			<Button on:click={() => onChangeCurveDef(curveDef)}>Update</Button>
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
