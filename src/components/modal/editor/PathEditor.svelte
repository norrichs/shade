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
	import PointInputs from './PointInputs.svelte';
	import {
		defaultPathEditorUiState,
		pathEditorUiStore,
		setPathEditorUiState,
		type PointInputMode
	} from './path-editor-ui-store';
	import DirectionLines from './DirectionLines.svelte';
	import DraggablePoint from './DraggablePoint.svelte';

	/**
	 * What an overlay snippet is handed.
	 *
	 * `curveDef` is the DISPLAY-space run and is live, so fills track a drag.
	 * `modelCurveDef` is the same run in model space — use it for any geometry you
	 * compose (rotation, reflection, radial repetition), because display space may
	 * be mirrored and mirroring reverses the direction of rotation. Convert the
	 * result back with `toDisplay` before emitting it as a path.
	 */
	export type PathEditorOverlayContext = {
		curveDef: BezierConfig[];
		modelCurveDef: BezierConfig[];
		toDisplay: (curves: BezierConfig[]) => BezierConfig[];
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
		showPointInputsToggle = false,
		pointInputMode = 'inline',
		editorId = undefined,
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
		showPointInputsToggle?: boolean;
		/** Starting layout for the numeric inputs; the user can switch it. */
		pointInputMode?: PointInputMode;
		/**
		 * Keys this editor's UI state in a module-level store. Floater remounts its
		 * panel content on every close, so without an id the "show point inputs"
		 * toggle resets each time the panel is reopened.
		 */
		editorId?: string;
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

	/**
	 * The single write path for a point, in stored coordinates. Dragging and typing
	 * both come through here, so a typed value is clamped by exactly the same
	 * limits as a dragged one.
	 */
	const commitPoint = (newPoint: PointConfig2, curveIndex: number, pointIndex: number) => {
		// A double-click arrives as two zero-distance drags. Bailing out here keeps
		// them from emitting a spurious change between the two clicks.
		const current = curveDef[curveIndex].points[pointIndex];
		if (current.x === newPoint.x && current.y === newPoint.y) return false;

		if (effectiveLimits.length === 0) {
			curveDef[curveIndex].points[pointIndex] = newPoint;
			curveDef = curveDef;
			return true;
		}
		curveDef = applyLimits({
			limits: effectiveLimits,
			curveDef,
			curveIndex,
			pointIndex,
			newPoint,
			oldPoint: { ...current }
		});
		return true;
	};

	const handleDrag = (newX: number, newY: number, curveIndex: number, pointIndex: number) => {
		const displayPoint = {
			type: 'PointConfig2',
			x: newX * canv.scale,
			y: newY * canv.scale
		} as PointConfig2;
		// Limits operate on stored data, so convert before applying them.
		commitPoint(flipY ? reflectPoint(displayPoint) : displayPoint, curveIndex, pointIndex);
	};

	/** Typed coordinates are already in stored space and commit immediately. */
	const handlePointInput = (x: number, y: number, curveIndex: number, pointIndex: number) => {
		const existing = curveDef[curveIndex].points[pointIndex];
		if (commitPoint({ ...existing, x, y }, curveIndex, pointIndex)) {
			onChangeCurveDef(curveDef);
		}
	};

	const handleDoubleClick = (curveIndex: number, pointIndex: number) => {
		if (!enablePointTypeToggle) return;
		const toggled = togglePointType(curveDef, curveIndex, pointIndex);
		if (toggled === curveDef) return;
		handleUpdateCurveDef(toggled);
	};

	// Unkeyed editors keep their toggle local and never write to the shared store.
	let localUi = $state({ ...defaultPathEditorUiState(), pointInputMode });
	let ui = $derived(
		editorId
			? ($pathEditorUiStore[editorId] ?? { ...defaultPathEditorUiState(), pointInputMode })
			: localUi
	);
	const updateUi = (patch: Partial<typeof localUi>) => {
		if (editorId) setPathEditorUiState(editorId, patch);
		else localUi = { ...localUi, ...patch };
	};

	const step = $derived(curveStep ?? canv.viewBoxData.width / 10);
	const overlayContext = $derived({
		curveDef: displayCurveDef,
		modelCurveDef: curveDef,
		toDisplay: reflectCurves,
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

	{#if showPointInputsToggle && ui.showPointInputs}
		<PointInputs
			{curveDef}
			{displayCurveDef}
			{canv}
			{config}
			mode={ui.pointInputMode}
			onChangeMode={(pointInputMode) => updateUi({ pointInputMode })}
			onChangePoint={handlePointInput}
		/>
	{/if}

	<div class="controls">
		{#if showPointInputsToggle}
			<label class="points-toggle">
				<input
					type="checkbox"
					checked={ui.showPointInputs}
					onchange={(event) =>
						updateUi({ showPointInputs: (event.currentTarget as HTMLInputElement).checked })}
				/>
				points
			</label>
		{/if}
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
	.points-toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: 0.85em;
		color: rgba(0, 0, 0, 0.6);
	}
	.controls {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}
</style>
