<script lang="ts" context="module">
	// @ts-ignore
	import { asDraggable } from 'svelte-drag-and-drop-actions';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { BezierConfig, PointConfig2 } from '$lib/types';
	import Button from '../../design-system/Button.svelte';
	import CurveDefPath from './CurveDefPath.svelte';
	import {
		addCurve,
		anchorDragsHandles,
		applyLimits,
		getCanvas,
		mirrorSmoothHandles,
		removeCurve,
		splitCurves,
		togglePointType,
		type LimitFunction,
		type PathEditorCanvas,
		type PathEditorConfig
	} from './path-editor';
	import CurveToolbar from './CurveToolbar.svelte';
	import DirectionLines from './DirectionLines.svelte';
	import DraggablePoint from './DraggablePoint.svelte';

	/** What an overlay snippet is handed. `curveDef` is live, so fills track a drag. */
	export type PathEditorOverlayContext = {
		curveDef: BezierConfig[];
		canv: PathEditorCanvas;
		config: PathEditorConfig;
	};

	/**
	 * How a drag propagates to neighbouring points.
	 * - `none` — only the dragged point moves (the historical behaviour).
	 * - `anchorDragsHandles` — anchors carry their handles and joined partners.
	 * - `full` — the above, plus smooth joints keep their handles colinear.
	 */
	export type PointCoupling = 'none' | 'anchorDragsHandles' | 'full';

	let {
		curveDef,
		config,
		onChangeCurveDef,
		manualUpdate = false,
		limits = [],
		children,
		flipY = false,
		showCurveTools = false,
		curveStep = undefined,
		minCurves = 1,
		coupling = 'none',
		enablePointTypeToggle = false,
		overlay = undefined,
		overlayAbove = undefined
	}: {
		curveDef: BezierConfig[];
		config: PathEditorConfig;
		onChangeCurveDef: (curveDef: BezierConfig[]) => void;
		manualUpdate?: boolean;
		limits?: LimitFunction[];
		children?: Snippet;
		/**
		 * Render with y increasing upward, the convention the curve configs were
		 * authored in: a silhouette's y becomes the model's z (`generate-level.ts`),
		 * so dragging a point up must make the model taller. SVG is y-down, so
		 * editors on those configs opt in here. Editors whose data is natively
		 * y-down (Cross Section, Edge Curve) leave it off.
		 */
		flipY?: boolean;
		showCurveTools?: boolean;
		/** How far an appended curve reaches, in model units. Defaults to a tenth of the viewBox. */
		curveStep?: number;
		minCurves?: number;
		coupling?: PointCoupling;
		enablePointTypeToggle?: boolean;
		overlay?: Snippet<[PathEditorOverlayContext]>;
		overlayAbove?: Snippet<[PathEditorOverlayContext]>;
	} = $props();

	let canv = $derived(getCanvas(config));

	// Everything below the props boundary renders in "display" space. When flipY is
	// set that is the model reflected about the viewBox's horizontal midline; the
	// reflection is its own inverse, so one helper converts in both directions.
	let flipAxis = $derived(canv.viewBoxData.top + canv.viewBoxData.height / 2);
	const reflectPoint = (point: PointConfig2): PointConfig2 => ({
		...point,
		y: 2 * flipAxis - point.y
	});
	const reflectCurves = (curves: BezierConfig[]): BezierConfig[] =>
		!flipY
			? curves
			: curves.map((curve) => ({
					...curve,
					points: curve.points.map(reflectPoint) as BezierConfig['points']
				}));

	let displayCurveDef = $derived(reflectCurves(curveDef));

	// Coupling runs after the consumer's limits so it sees the clamped position.
	let effectiveLimits = $derived([
		...limits,
		...(coupling === 'none'
			? []
			: coupling === 'anchorDragsHandles'
				? [anchorDragsHandles]
				: [anchorDragsHandles, mirrorSmoothHandles])
	] as LimitFunction[]);

	const handleDragEnd = () => {
		if (onChangeCurveDef && !manualUpdate) {
			onChangeCurveDef(curveDef);
		}
	};

	/** Takes display-space curves (from click-to-insert) back to model space. */
	const handleUpdateDisplayCurveDef = (displayed: BezierConfig[]) => {
		curveDef = reflectCurves(displayed);
		onChangeCurveDef(curveDef);
	};

	const handleUpdateCurveDef = (newCurveDef: BezierConfig[]) => {
		curveDef = newCurveDef;
		onChangeCurveDef(curveDef);
	};

	const handleDrag = (newX: number, newY: number, curveIndex: number, pointIndex: number) => {
		const displayPoint = {
			type: 'PointConfig2',
			x: newX * canv.scale,
			y: newY * canv.scale
		} as PointConfig2;
		// Limits operate on stored data, so convert before applying them.
		const scaledPoint = flipY ? reflectPoint(displayPoint) : displayPoint;

		// A double-click arrives as two zero-distance drags. Bailing out here keeps
		// them from emitting a spurious change between the two clicks.
		const current = curveDef[curveIndex].points[pointIndex];
		if (current.x === scaledPoint.x && current.y === scaledPoint.y) return;

		if (effectiveLimits.length === 0) {
			curveDef[curveIndex].points[pointIndex] = scaledPoint;
			curveDef = curveDef;
			return;
		}
		curveDef = applyLimits({
			limits: effectiveLimits,
			curveDef,
			curveIndex,
			pointIndex,
			newPoint: scaledPoint,
			oldPoint: { ...current }
		});
	};

	const handleDoubleClick = (curveIndex: number, pointIndex: number) => {
		if (!enablePointTypeToggle) return;
		const toggled = togglePointType(curveDef, curveIndex, pointIndex);
		if (toggled === curveDef) return;
		handleUpdateCurveDef(toggled);
	};

	const step = $derived(curveStep ?? canv.viewBoxData.width / 10);
	const overlayContext = $derived({
		curveDef: displayCurveDef,
		canv,
		config
	} as PathEditorOverlayContext);
</script>

<div class="container">
	<svg width={config.size.width} height={config.size.height} viewBox={canv.viewBox} class="canvas">
		{@render overlay?.(overlayContext)}
		<CurveDefPath
			curveDef={displayCurveDef}
			{canv}
			onChangeCurveDef={handleUpdateDisplayCurveDef}
		/>
		<DirectionLines curveDef={displayCurveDef} canvScale={canv.scale} />
		{@render overlayAbove?.(overlayContext)}
		{@render children?.()}
	</svg>
	{#each displayCurveDef as curve, curveIndex}
		{#each curve.points as point, pointIndex}
			<DraggablePoint
				{config}
				{canv}
				{curveIndex}
				{pointIndex}
				{point}
				pointType={point.pointType}
				{handleDragEnd}
				handleDoubleClick={() => handleDoubleClick(curveIndex, pointIndex)}
				handleDrag={(x, y) => handleDrag(x, y, curveIndex, pointIndex)}
			/>
		{/each}
	{/each}

	<div class="controls">
		{#if showCurveTools}
			<CurveToolbar
				onAdd={() => handleUpdateCurveDef(addCurve(curveDef, step))}
				onSplit={() => handleUpdateCurveDef(splitCurves(curveDef))}
				onRemove={() => handleUpdateCurveDef(removeCurve(curveDef, minCurves))}
				canRemove={curveDef.length > minCurves}
			/>
		{/if}
		{#if manualUpdate && onChangeCurveDef}
			<Button onclick={() => onChangeCurveDef(curveDef)}>Update</Button>
		{/if}
	</div>
</div>

<style>
	.canvas {
		background-color: beige;
	}

	.container {
		border: 1px dotted black;
		padding: 0;
		position: relative;
	}
	.controls {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}
</style>
