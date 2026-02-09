<script context="module">
	// @ts-expect-error
	import { asDraggable } from 'svelte-drag-and-drop-actions';
</script>

<script lang="ts">
	import { generateDefaultRadialShapeConfig } from '$lib/shades-config';
	import { configStore0 } from '$lib/stores/stores';
	import {
		onPathPointMove,
		togglePointType,
		addCurve,
		removeCurve,
		splitCurves
	} from './path-edit';
	import type {
		CurveConfig,
		BezierConfig,
		PointConfig2,
		ShapeConfig,
		SilhouetteConfig,
		DepthCurveConfig,
		SpineCurveConfig
	} from '$lib/types';
	import CheckBoxInput from '../controls/CheckboxInput.svelte';
	import PathEditInput from '../path-edit/PathEditInput.svelte';
	import { getCurvePoints, getLevelLines } from '$lib/generate-level';
	import CheckboxInput from '../controls/CheckboxInput.svelte';

	type ShowControlCurveValue =
		| 'ShapeConfig'
		| 'DepthCurveConfig'
		| 'SilhouetteConfig'
		| 'SpineCurveConfig';

	const isCurveConfig = (subConfig: any): subConfig is CurveConfig => {
		return (
			typeof subConfig === 'object' &&
			['SilhouetteConfig', 'ShapeConfig', 'DepthCurveConfig', 'SpineCurveConfig'].includes(
				(subConfig as CurveConfig).type
			)
		);
	};

	let { curveStoreType }: { curveStoreType: ShowControlCurveValue } = $props();

	const curveConfigByType = {
		SilhouetteConfig: 'silhouetteConfig',
		DepthCurveConfig: 'depthCurveConfig',
		ShapeConfig: 'shapeConfig',
		SpineCurveConfig: 'spineCurveConfig'
	};

	let curveStore: CurveConfig = $state(undefined as any);
	let thisConfig = $state(undefined as any);

	const reverseUpdate = () => {
		const tc = $configStore0[curveConfigByType[curveStoreType]];
		thisConfig = tc;
		curveStore = isCurveConfig(tc) ? tc : $configStore0.silhouetteConfig;
	};

	$effect(() => {
		const tc = $configStore0[curveConfigByType[curveStoreType]];
		thisConfig = tc;
		curveStore = isCurveConfig(tc) ? tc : $configStore0.silhouetteConfig;
	});

	let symmetry = $state(1);
	let reflect = $state(true);
	let fill = true;
	let showPointInputs = $state(false);
	let showPointInputsInline = $state(false);
	let curvePoints = $state(
		getCurvePoints(
			$configStore0[curveConfigByType[curveStoreType]]! as SilhouetteConfig,
			$configStore0.levelConfig.silhouetteSampleMethod
		)
	);

	const canv = {
		minX: -200,
		minY: -200,
		maxX: 200,
		maxY: 200
	};

	let curves: BezierConfig[] = $state(undefined as any);
	$effect(() => {
		if (curveStore) curves = curveStore.curves;
	});
	let limitAngle = $derived(getLimitAngle(curveStore));

	$effect(() => {
		if (curveStore) {
			symmetry = curveStore.type === 'ShapeConfig' ? curveStore.symmetryNumber : 1;
			reflect =
				curveStore.type === 'ShapeConfig'
					? curveStore.symmetry === 'lateral' || curveStore.symmetry === 'radial-lateral'
					: true;
		}
	});

	const transform = (
		curves: BezierConfig[],
		config: { reflect: boolean; radialSymmetry: number }
	) => {
		let transformed: BezierConfig[] = $state.snapshot(curves);
		if (config.reflect) {
			transformed = transformed.map((curve) => {
				const reflectedCurve: BezierConfig = {
					...curve,
					points: curve.points.map((point) => {
						const reflectedPoint: PointConfig2 = {
							...point,
							x: -point.x
						};
						return reflectedPoint;
					}) as [PointConfig2, PointConfig2, PointConfig2, PointConfig2]
				};
				return reflectedCurve;
			});
		}
		return transformed;
	};

	const getPathFromCurves = (curves: BezierConfig[]): string => {
		const starter = `M ${curves[0].points[0].x} ${-curves[0].points[0].y}`;
		return curves.reduce(
			(path, c) => `
			${path} C
			${c.points[1].x} ${-c.points[1].y},
			${c.points[2].x} ${-c.points[2].y},
			${c.points[3].x} ${-c.points[3].y} `,
			starter
		);
	};

	const getFillFromCurves = (curves: BezierConfig[]): string => {
		const starter = `M 0 ${-curves[0].points[0].y}, L${curves[0].points[0].x} ${-curves[0].points[0]
			.y}`;
		return (
			curves.reduce(
				(path, c) => `
			${path} C
			${c.points[1].x} ${-c.points[1].y},
			${c.points[2].x} ${-c.points[2].y},
			${c.points[3].x} ${-c.points[3].y} `,
				starter
			) + `L 0 ${-curves[curves.length - 1].points[3].y}`
		);
	};

	const getShapeFillFromCurves = (curves: BezierConfig[]): string => {
		const starter = `M ${curves[0].points[0].x} ${-curves[0].points[0].y}`;
		return curves.reduce(
			(path, c) => `
			${path} C
			${-c.points[1].x} ${c.points[1].y},
			${-c.points[2].x} ${c.points[2].y},
			${-c.points[3].x} ${c.points[3].y}
		`,
			starter
		);
	};

	const reflectCurvesAroundX = (curves: BezierConfig[]): BezierConfig[] => {
		return curves
			.map((curve) => ({
				...curve,
				points: curve.points.map((point) => ({ ...point, x: -point.x, y: point.y })).reverse() as [
					PointConfig2,
					PointConfig2,
					PointConfig2,
					PointConfig2
				]
			}))
			.reverse();
	};

	const rotateCurvesAroundOrigin = (curves: BezierConfig[], angle: number): BezierConfig[] => {
		const localCurves: BezierConfig[] = $state.snapshot(curves);
		return localCurves.map((curve) => ({
			...curve,
			points: curve.points.map((point) => {
				const r = Math.sqrt(Math.pow(point.x, 2) + Math.pow(point.y, 2)); //* angle / 2;
				const a = Math.atan(point.y / point.x);
				return { ...point, x: r * Math.cos(a + angle), y: r * Math.sin(a + angle) };
			}) as [PointConfig2, PointConfig2, PointConfig2, PointConfig2]
		}));
	};

	const radializeCurves = (
		curves: BezierConfig[],
		config: ShapeConfig | SilhouetteConfig
	): BezierConfig[] => {
		if (config.type === 'SilhouetteConfig') {
			return curves;
		}
		const localCurves: BezierConfig[] = $state.snapshot(curves);
		const isReflected = config.symmetry === 'lateral' || config.symmetry === 'radial-lateral';
		const isRadial = config.symmetry === 'radial' || config.symmetry === 'radial-lateral';

		if (isRadial) {
			let resultCurves: BezierConfig[] = [];
			let unitCurves: BezierConfig[] = $state.snapshot(localCurves);
			const angle = (Math.PI * 2) / config.symmetryNumber;
			if (isReflected) {
				unitCurves.push(...reflectCurvesAroundX(localCurves));
			}
			for (let i = 0; i <= config.symmetryNumber; i++) {
				resultCurves.push(...rotateCurvesAroundOrigin(unitCurves, angle * i));
			}
			return resultCurves;
		}

		return curves;
	};

	const getLimitAngle = (
		config: ShapeConfig | SilhouetteConfig | DepthCurveConfig | SpineCurveConfig
	): number | null => {
		if (
			config?.type === 'ShapeConfig' &&
			(config.symmetry === 'radial' || config.symmetry === 'radial-lateral')
		) {
			return (Math.PI * 2) / config.symmetryNumber;
		} else {
			return null;
		}
	};

	const isLimited = (cMax: number, c: number, pMax: number, p: number) => {
		return (c === cMax && p === pMax) || (c === 0 && p === 0);
	};

	const handleSymmetryChange = (event: any) => {
		const symmetry = event?.target?.valueAsNumber || 5;
		$configStore0.shapeConfig = generateDefaultRadialShapeConfig(symmetry, {
			method: 'divideCurve',
			divisions: 4
		});
		reverseUpdate();
	};

	const updateStores = () => {
		($configStore0[curveConfigByType[curveStoreType]] as CurveConfig).curves = curves;
		curves = ($configStore0[curveConfigByType[curveStoreType]] as CurveConfig).curves;
	};

	const updateCurves = (
		x: number,
		y: number,
		dx: number,
		dy: number,
		curveIndex: number,
		pointIndex: number,
		shouldUpdateStores = false
	) => {
		curves = onPathPointMove(
			x,
			-y,
			dx,
			-dy,
			curveIndex,
			pointIndex,
			curves,
			limitAngle &&
				isLimited(curves.length - 1, curveIndex, curves[curveIndex].points.length - 1, pointIndex)
				? limitAngle
				: Math.PI * 2,
			curveStore.type === 'ShapeConfig'
		);
		curvePoints = getCurvePoints(
			$configStore0[curveConfigByType[curveStoreType]]! as SilhouetteConfig,
			$configStore0.levelConfig.silhouetteSampleMethod
		);
		if (curveStoreType === 'SpineCurveConfig') {
			// levelLines = getLevelLines(curvePoints, $configStore0);
		}

		if (shouldUpdateStores) {
			updateStores();
		}
	};
</script>

<div class="container">
	<!-- {#if curveStore.type === 'DepthCurveConfig'}
		<div class="data-grid">
			{#each curveStore.curves as curve, i}
				<input
					class="data-grid-number"
					type="number"
					bind:value={curveStore.curves[i].points[0].x}
					oninput={updateStores}
				/>
				<input
					class="data-grid-number"
					type="number"
					bind:value={curveStore.curves[i].points[0].y}
					oninput={updateStores}
				/>
				<input
					class="data-grid-number"
					type="number"
					bind:value={curveStore.curves[i].points[3].x}
					oninput={updateStores}
				/>
				<input
					class="data-grid-number"
					type="number"
					bind:value={curveStore.curves[i].points[3].y}
					oninput={updateStores}
				/>
			{/each}
		</div>
	{/if} -->
	<svg
		viewBox={`${canv.minX} ${canv.minY} ${canv.maxX - canv.minX} ${canv.maxY - canv.minY}`}
		style="overflow:visible"
	>
		<circle cx="0" cy="0" r="4" fill="none" stroke="black" stroke-width="0.5" />
		{#if curveStore?.type === 'SilhouetteConfig' && curves}
			<path
				d={getFillFromCurves(curves)}
				stroke="none"
				fill={fill ? 'rgba(255,0,0,0.5)' : 'transparent'}
			/>
			<path
				d={getFillFromCurves(transform(curves, { reflect, radialSymmetry: symmetry }))}
				stroke="none"
				fill="rgba(255,0,0,0.5)"
			/>
		{/if}
		{#if curveStore?.type === 'ShapeConfig' && curves}
			<path
				d={getShapeFillFromCurves(radializeCurves(curves, curveStore))}
				stroke="black"
				fill="rgba(255,90,0,0.6)"
			/>
		{/if}
		{#if curves}
			<path
				d={getPathFromCurves(curves)}
				stroke="rgba(0,0,255,0.5)"
				stroke-width="5"
				fill="transparent"
			/>
			{#each curves as c}
				<line
					x1={c.points[0].x}
					y1={-c.points[0].y}
					x2={c.points[1].x}
					y2={-c.points[1].y}
					stroke="gray"
					stroke-width=".5"
				/>
				<line
					x1={c.points[2].x}
					y1={-c.points[2].y}
					x2={c.points[3].x}
					y2={-c.points[3].y}
					stroke="gray"
					stroke-width="1"
				/>
			{/each}
		{/if}
		<g id="path-edit-curve-points" fill="rgba(0,0,0,0.5)">
			{#each curvePoints.points as point}
				<circle cx={point.x} cy={-point.y} r={2} />
			{/each}
		</g>
	</svg>

	{#if curves}
		{#each curves as curve, curveIndex}
			{#each curve.points as point, p}
				<div
					class={`${p === 1 || p === 2 ? 'Handle' : 'Point'} ${
						point.pointType === 'angled' ? 'angled' : 'smooth'
					}`}
					style="left:{point.x - canv.minX}px; top:{-point.y - canv.minY}px"
					ondragend={() => updateStores()}
					ondblclick={() => togglePointType(p, curveIndex, curves, updateStores)}
					use:asDraggable={{
						onDragStart: { x: point.x, y: -point.y },
						onDragMove: (x, y, dx, dy) => updateCurves(x, y, dx, dy, curveIndex, p),
						minX: canv.minX,
						minY: canv.minY,
						maxX: canv.maxX,
						maxY: canv.maxY
					}}
				/>
			{/each}
		{/each}
	{/if}
	<div>
		<div class="control-overlay row">
			<CheckBoxInput show={true} bind:value={showPointInputs} label="show point inputs" />
			<CheckboxInput show={showPointInputs} bind:value={showPointInputsInline} label="inline?" />
		</div>
		{#if showPointInputs && curves}
			<div class={`point-input-container ${showPointInputsInline ? 'overlay' : 'outrigger'}`}>
				{#each curves as curve, curveIndex}
					{#each curve.points as point, p}
						<!-- {#if (curveIndex === 0 && p === 0) || p === 3} -->
						<PathEditInput
							{canv}
							bind:point={curves[curveIndex].points[p]}
							showPointInputsInline
							offsetDirection={{ type: 'lateral', value: 20 }}
							onUpdate={(x, y, dx, dy) => {
								updateCurves(x, y, dx, dy, curveIndex, p, true);
							}}
						/>
						<!-- {/if} -->
					{/each}
				{/each}
			</div>
		{/if}
	</div>

	<div class="controls">
		<button
			onclick={() => {
				curves = addCurve(curves);
				updateStores();
			}}>+</button
		>
		<button
			onclick={() => {
				curves = splitCurves(curves);
				updateStores();
			}}>sp</button
		>
		<button
			onclick={() => {
				curves = removeCurve(curves);
				updateStores();
			}}>-</button
		>

		{#if curveStore?.type === 'ShapeConfig'}
			<label for="input-symmetry-number">Symmetry</label>
			<input
				id="input-symmetry-number"
				type="number"
				min="1"
				max="99"
				bind:value={curveStore.symmetryNumber}
				onchange={handleSymmetryChange}
			/>
			<label for="select-sample-method">Sample Method</label>
			<select bind:value={curveStore.sampleMethod.method} onchange={updateStores}>
				<option value="divideCurvePath">Whole</option>
				<option value="divideCurve">Curve</option>
			</select>
			<label for="input-divisions">div</label>
			<input
				id="input-divisions"
				type="number"
				min="0"
				max="99"
				bind:value={curveStore.sampleMethod.divisions}
				oninput={() => {
					updateStores();
				}}
			/>
			<select id="select-symmetry" bind:value={curveStore.symmetry} placeholder="mode">
				<option>asymmetric</option>
				<option>radial</option>
				<option>lateral</option>
				<option>radial-lateral</option>
			</select>
		{/if}
	</div>
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
	.data-grid {
		--grid-dimension: 50px;
		position: absolute;
		width: calc(var(--grid-dimension) * 2);
		display: grid;
		grid-template-columns: var(--grid-dimension) var(--grid-dimension);
		background-color: beige;
		place-items: center;
	}
	.data-grid > input.data-grid-number {
		margin: 0;
		height: 100%;
		width: 100%;
		max-width: 100%;
		border: none;
		background-color: azure;
	}

	.container {
		display: flex;
		flex-direction: column;
		padding: 0;
		position: relative;
		width: 400px;
		height: 400px;
		margin: 20px;
		border: dotted 1px black;
		border-radius: 4px;
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

	.Point.angled {
		background: red;
	}
	.Point.smooth {
		background: blue;
	}
	button {
		background-color: lightgreen;
		border-radius: 50%;
		border: 0;
		padding: 0;
		font-size: 20px;
		width: 30px;
		aspect-ratio: 1;
	}
	.controls {
		padding: 4px;
		display: flex;
		flex-direction: row;
		gap: 8px;
		border: 1px dotted black;
		border-radius: 4px;
		margin: 2px -1px;
	}
	.controls input {
		width: 32px;
	}

	.control-overlay {
		position: absolute;
		left: 0;
		top: 0;
	}
	.control-overlay.row {
		display: flex;
		flex-direction: row;
	}
	.point-input-container.overlay {
		position: absolute;
		top: 0;
		left: 0;
		bottom: 0;
		right: 0;
		pointer-events: none;
	}
	.point-input-container.outrigger {
		position: absolute;
		right: -210px;
		top: 0;
		background-color: magenta;
		width: 200px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
</style>
