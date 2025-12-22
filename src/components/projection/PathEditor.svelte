<script context="module" lang="ts">
	// @ts-ignore
	import { asDraggable } from 'svelte-drag-and-drop-actions';
</script>

<script lang="ts">
	import type { EditablePolygon } from '$lib/projection-geometry/edit-projection';
	import type { CubicBezierCurve, CurvePath, Vector2 } from 'three';
	import { getPathFromCurves, viewBox } from './path-edit';
	import { getLimits, setPoint } from '../path-edit/path-edit';
	const RECALCULATE_MODEL_ON_DROP = true;
	const UPDATE_CURVEDEF_ON_DRAG = true;

	type PathEditorMode = 'edit' | 'view' | 'mini';

	export let polygon: EditablePolygon;
	export let curves: CurvePath<Vector2>[];
	export let onChangeCurves: (props: {
		changed: CurvePath<Vector2>[];
		edge: { vertex0: Vector2; vertex1: Vector2 };
		indices: { edge: number; curve: number };
		reversed: boolean;
		final: boolean;
	}) => void;
	export let mode: PathEditorMode;

	let curvePaths: string[] = [];
	let handleLines: string[] = [];
	let controlPoints: [Vector2, Vector2, Vector2, Vector2][][];
	let canvScale = 1;

	const handleDragEnd = ([edgeIndex, curveIndex, pointIndex]: [number, number, number]) => {
		const changedCurve = curves;
		onChangeCurves({
			changed: changedCurve,
			edge: {
				vertex0: polygon.edges[edgeIndex].vertex0,
				vertex1: polygon.edges[edgeIndex].vertex1
			},
			indices: { edge: edgeIndex, curve: curveIndex },
			reversed: polygon.edges[edgeIndex].isDirectionMatched,
			final: true
		});
	};

	const handleDrag = ([edgeIndex, curveIndex, pointIndex]: [number, number, number]) => {
		const changedCurve = curves;
		onChangeCurves({
			changed: changedCurve,
			edge: {
				vertex0: polygon.edges[edgeIndex].vertex0,
				vertex1: polygon.edges[edgeIndex].vertex1
			},
			indices: { edge: edgeIndex, curve: curveIndex },
			reversed: polygon.edges[edgeIndex].isDirectionMatched,
			final: false
		});
	};

	const updateMode = (mode: PathEditorMode) => {
		switch (mode) {
			case 'edit':
				canvScale = 1;
				break;
			case 'mini':
				canvScale = 0.25;
				break;
			case 'view':
				canvScale = 1;
				break;
		}
	};

	const update = (c: CurvePath<Vector2>[]) => {
		curvePaths = c.map((edgeCurvePath) => getPathFromCurves(edgeCurvePath));
		controlPoints = c.map((edgeCurvePath) =>
			(edgeCurvePath.curves as CubicBezierCurve[]).map(
				(bez) => [bez.v0, bez.v1, bez.v2, bez.v3] as [Vector2, Vector2, Vector2, Vector2]
			)
		);
		handleLines = controlPoints
			.flat(1)
			.map(([v0, v1, v2, v3]) => [
				`M ${v0.x} ${v0.y} L ${v1.x} ${v1.y}`,
				`M ${v2.x} ${v2.y} L ${v3.x} ${v3.y}`
			])
			.flat();
	};

	export let canv;
	$: updateMode(mode);
	$: update(curves);
</script>

<div
	class="container"
	style={`--canv-width: ${(canv.maxX - canv.minX) * canvScale}px; --canv-height: ${
		(canv.maxY - canv.minY) * canvScale
	}px`}
>
	<svg viewBox={viewBox(canv)}>
		<slot name="polygon-fill" />
		<slot name="polygon-border" />
		<circle cx="0" cy="0" r="3" class="center-circle" />
		{#each curvePaths as path}
			<path d={path} stroke="rgba(0,0,200,.75)" stroke-width={0.5} fill="none" />
		{/each}
		{#each handleLines as line}
			<path d={line} stroke="black" stroke-width={0.5} />
		{/each}
	</svg>

	{#if mode === 'edit'}
		{#each controlPoints as edge, e}
			{#each edge as curve, c}
				{#each curve as point, p (`${e}${c}${p}`)}
					{#if p > 0}
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							class={`${p === 1 || p === 2 ? 'Handle' : 'Point'} `}
							style="left:{(point.x - canv.minX) * canvScale}px; top:{(point.y - canv.minY) *
								canvScale}px"
							on:dragend={() => {
								if (RECALCULATE_MODEL_ON_DROP) {
									handleDragEnd([e, c, p]);
								}
							}}
							on:dblclick={() => console.log('double click')}
							use:asDraggable={{
								onDragStart: { x: point.x, y: point.y },
								// @ts-expect-error
								onDragMove: (x, y, dx, dy) => {
									const limits = getLimits(polygon, [e, c, p]);
									setPoint({ p: point, x, y, limits });
									update(curves);
									if (UPDATE_CURVEDEF_ON_DRAG) {
										handleDrag([e, c, p]);
									}
								},
								minX: canv.minX,
								minY: canv.minY,
								maxX: canv.maxX,
								maxY: canv.maxY
							}}
						/>
					{/if}
				{/each}
			{/each}
		{/each}
	{/if}
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		padding: 0;
		position: relative;
		max-width: var(--canv-width);
		max-height: var(--canv-height);
	}
	.container > svg {
		overflow: visible;
		background-color: beige;
		border-radius: inherit;
		width: var(--canv-width);
		height: var(--canv-height);
	}
	.center-circle {
		fill: none;
		stroke: black;
		stroke-width: 1;
	}
	.Handle {
		display: block;
		position: absolute;
		transform: translate(-50%, -50%);
		width: 8px;
		height: 8px;
		border: solid 1px black;
		background: yellow;
		cursor: move;
		border-radius: 50%;
	}

	.Point {
		display: block;
		position: absolute;
		transform: translate(-50%, -50%);
		width: 8px;
		height: 8px;
		border: solid 1px black;
		cursor: move;
	}
</style>
