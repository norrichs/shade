<script context="module">
	import { asDraggable } from 'svelte-drag-and-drop-actions';
</script>

<script lang="ts">
	import type { Writable } from 'svelte/store';
	import { blankCurveConfig, config0 } from '../../lib/stores';
	import { onPathPointMove, togglePointType, addCurve, removeCurve, splitCurves } from './path-edit';
	import type {
		BezierConfig,
		PointConfig,
		RadialShapeConfig,
		ZCurveConfig,
		DepthCurveConfig,
	} from '$lib/rotated-shape';


	type CurveConfig = ZCurveConfig | RadialShapeConfig | DepthCurveConfig
	type ShowControlCurveValue = 'RadialShapeConfig' | 'DepthCurveConfig' | 'ZCurveConfig';

	const isCurveConfig = (subConfig: any): subConfig is CurveConfig => {
		console.debug("isCurveConfig", subConfig);
		return typeof subConfig === "object" &&
		[ "ZCurveConfig", "RadialShapeConfig", "DepthCurveConfig"].includes((subConfig as CurveConfig).type)
	}

	// export let curveStore: Writable<ZCurveConfig | RadialShapeConfig | DepthCurveConfig> = blankCurveConfig;

	export let curveStoreType: ShowControlCurveValue;
	const curveConfigByType = {
		"ZCurveConfig": "zCurveConfig",
		"DepthCurveConfig": "depthCurveConfig",
		"RadialShapeConfig": "shapeConfig"
	}
	let curveStore: CurveConfig
	let thisConfig
	

	$: {
		console.debug("reactive", curveStoreType)
		thisConfig = $config0[curveConfigByType[curveStoreType]]
		curveStore = isCurveConfig(thisConfig) ? thisConfig : $config0.zCurveConfig
	}

	let symmetry: number = 1;
	let reflect: boolean = true;
	let fill: boolean = true;

	const canv = {
		minX: -200,
		minY: -200,
		maxX: 200,
		maxY: 200
	};

	$: curves = curveStore.curves;
	$: limitAngle = getLimitAngle(curveStore)

	$: {
		symmetry = curveStore.type === 'RadialShapeConfig' ? curveStore.symmetryNumber : 1;
		reflect =
			curveStore.type === 'RadialShapeConfig'
				? curveStore.symmetry === 'lateral' || curveStore.symmetry === 'radial-lateral'
				: true;
	}

	const transform = (
		curves: BezierConfig[],
		config: { reflect: boolean; radialSymmetry: number }
	) => {
		let transformed: BezierConfig[] = window.structuredClone(curves);
		if (config.reflect) {
			transformed = transformed.map((curve) => {
				const reflectedCurve: BezierConfig = {
					...curve,
					points: curve.points.map((point) => {
						const reflectedPoint: PointConfig = {
							...point,
							x: -point.x
						};
						return reflectedPoint;
					}) as [PointConfig, PointConfig, PointConfig, PointConfig]
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
		const starter = `M 0 ${-curves[0].points[0].y}, L${curves[0].points[0].x} ${-curves[0].points[0].y}`;
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
		`, starter);
	};

	const reflectCurvesAroundX = (curves: BezierConfig[]): BezierConfig[] => {
		return curves
			.map((curve) => ({
				...curve,
				points: curve.points.map((point) => ({ ...point, x: -point.x, y: point.y })).reverse() as [
					PointConfig,
					PointConfig,
					PointConfig,
					PointConfig
				]
			}))
			.reverse();
	};

	const rotateCurvesAroundOrigin = (curves: BezierConfig[], angle: number): BezierConfig[] => {
		const localCurves: BezierConfig[] = window.structuredClone(curves)
		return localCurves.map((curve) => ({
			...curve,
			points: curve.points.map((point) => {
				const r = Math.sqrt(Math.pow(point.x, 2) + Math.pow(point.y, 2)) //* angle / 2;
				const a = Math.atan(point.y / point.x)
				return { ...point, x: r * Math.cos(a + angle), y: r * Math.sin(a + angle) };
			}) as [PointConfig, PointConfig, PointConfig, PointConfig]
		}));
	};

	const radializeCurves = (
		curves: BezierConfig[],
		config: RadialShapeConfig | ZCurveConfig
	): BezierConfig[] => {
		if (config.type === 'ZCurveConfig') {
			return curves;
		}
		const localCurves: BezierConfig[] = window.structuredClone(curves);
		const isReflected = config.symmetry === 'lateral' || config.symmetry === 'radial-lateral';
		const isRadial = config.symmetry === 'radial' || config.symmetry === 'radial-lateral';

		if (isRadial) {
			let resultCurves: BezierConfig[] = [];
			let unitCurves: BezierConfig[] = window.structuredClone(localCurves);
			const angle = (Math.PI * 2) / config.symmetryNumber;
			if (isReflected) {
				unitCurves.push(...reflectCurvesAroundX(localCurves));
			}
			for (let i = 0; i <= config.symmetryNumber; i++) {
				resultCurves.push(...rotateCurvesAroundOrigin(unitCurves, angle * i));
			}
			return resultCurves ;
		}

		return curves;
	};

	const getLimitAngle = (config: RadialShapeConfig | ZCurveConfig | DepthCurveConfig): number | null => {
		if (config.type === "RadialShapeConfig" && (config.symmetry === "radial" || config.symmetry === "radial-lateral")) {
			return Math.PI * 2 / config.symmetryNumber
		} else {
			return null;
		}
	}

	const isLimited = (cMax: number, c: number, pMax: number, p: number) => {
		return (c === cMax && p === pMax) || (c === 0 && p === 0)
	}

	const update = () => {
		($config0[curveConfigByType[curveStoreType]] as CurveConfig).curves = curves
		curves = ($config0[curveConfigByType[curveStoreType]] as CurveConfig).curves
		// curveStore.curves = curves;
		// curves = curveStore.curves;
	};
</script>

<div class="container">
	<svg
		viewBox={`${canv.minX} ${canv.minY} ${canv.maxX - canv.minX} ${canv.maxY - canv.minY}`}
		style="overflow:visible"
	>
		<circle cx="0" cy="0" r="4" fill="none" stroke="black" stroke-width="0.5" />
		{#if curveStore.type === 'ZCurveConfig'}
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
		{#if curveStore.type === 'RadialShapeConfig'}
			<path
				d={getShapeFillFromCurves(radializeCurves(curves, curveStore))}
				stroke="black"
				fill="rgba(255,90,0,0.6)"
			/>
		{/if}
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
	</svg>

	{#each curves as curve, curveIndex}
		{#each curve.points as point, p}
			<div
				class={`${p === 1 || p === 2 ? 'Handle' : 'Point'} ${
					point.pointType === 'angled' ? 'angled' : 'smooth'
				}`}
				style="left:{point.x - canv.minX}px; top:{-point.y - canv.minY}px"
				on:dragend={update}
				on:dblclick={() => togglePointType(p, curveIndex, curves, update)}
				use:asDraggable={{
					onDragStart: { x: point.x, y: -point.y },
					onDragMove: (x, y, dx, dy) =>
						(curves = onPathPointMove(
							x, 
							-y, 
							dx, 
							-dy, 
							curveIndex, 
							p, 
							curves, 
							limitAngle && isLimited(curves.length - 1, curveIndex, curve.points.length - 1, p) ? limitAngle : Math.PI * 2,
							curveStore.type === "RadialShapeConfig"
							)),
					minX: canv.minX,
					minY: canv.minY,
					maxX: canv.maxX,
					maxY: canv.maxY
				}}
			/>
		{/each}
	{/each}
	
	<div class="controls">
		<button
			on:click={() => {
				curves = addCurve(curves);
				update();
			}}>+</button
		>
		<button
			on:click={() => {
				curves = splitCurves(curves);
				update();
			}}>sp</button>
		<button
			on:click={() => {
				curves = removeCurve(curves);
				update();
			}}>-</button
		>
		{#if curveStore.type === "RadialShapeConfig"}
			<label for="input-symmetry-number">rs</label>
			<input id="input-symmetry-number" type="number" min="1" max="99" bind:value={curveStore.symmetryNumber} />
			<label for="input-divisions">div</label>
			<input id="input-divisions" type="number" min="0" max="99" bind:value={curveStore.sampleMethod.divisions} />
			<!-- <label for="input-divisions">rs</label> -->
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
</style>
