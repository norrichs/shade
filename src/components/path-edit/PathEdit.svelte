<script context="module">
	// import  DragDropTouch  from 'svelte-drag-drop-touch'
	import { asDraggable } from 'svelte-drag-and-drop-actions';
</script>

<script lang="ts">
	import type { BezierConfig, PointConfig } from '../../lib/rotated-shape';
	import { curveConfig } from '../../lib/stores';
	import { beforeNavigate } from '$app/navigation';

	const canv = {
		minX: 0,
		minY: 0,
		maxX: 400,
		maxY: 400
	};

	let zCurve = $curveConfig;

	const onDoubleClickPoint = (pointIndex: number, curveIndex: number): void => {
		if (pointIndex === 1 || pointIndex === 2) return
		if ((pointIndex === 3 && curveIndex === zCurve.curves.length - 1) || (pointIndex === 0 && curveIndex === 0)) return
		//point
		const point = zCurve.curves[curveIndex].points[pointIndex]
		const partner = zCurve.curves[pointIndex === 3 ? curveIndex + 1 : curveIndex - 1].points[pointIndex === 3 ? 0 : 3]
		const newType = point.pointType === undefined || point.pointType === "smooth" ? "angled" : "smooth"
		
		console.debug("dblclick", point, partner)

		point.pointType = newType;
		partner.pointType = newType;

		console.debug("after", point, partner)
		update()
	};

	const onDragMove = (
		x: number,
		y: number,
		dx: number,
		dy: number,
		curveIndex: number,
		pointIndex: number
	) => {
		const curve = zCurve.curves[curveIndex];
		if (curve.type === 'BezierConfig') {
			const isPoint = pointIndex === 0 || pointIndex === 3;
			const isHandle = !isPoint;
			const isJoined =
				(pointIndex <= 1 &&
					curveIndex > 0 &&
					zCurve.curves[curveIndex - 1].type === 'BezierConfig') ||
				(pointIndex >= 2 && zCurve.curves[curveIndex + 1]?.type === 'BezierConfig');
			console.debug('isJoined', isJoined, zCurve.curves, curveIndex, pointIndex);

			const partner = !isJoined ? null : zCurve.curves[curveIndex + (pointIndex <= 1 ? -1 : 1)];
			const partnerPointIndex = pointIndex <= 1 ? 3 : 0
			const isAngled = 
				isJoined &&
				(curve.points[pointIndex].pointType === 'angled' ||
						(partner && partner.points[partnerPointIndex].pointType === 'angled'));

			if (isPoint && isJoined && partner?.type === 'BezierConfig') {
				console.debug('is joined point');
				// coordinate associated points of joined point - handle, partner point, partner handle
				const [partnerHandle, partnerPoint] =
					pointIndex <= 1
						? [partner.points[2], partner.points[3]]
						: [partner.points[1], partner.points[0]];
				const handle = curve.points[pointIndex <= 1 ? 1 : 2];
				handle.x += dx;
				handle.y += dy;
				partnerHandle.x += dx;
				partnerHandle.y += dy;
				partnerPoint.x += dx;
				partnerPoint.y += dy;
				console.debug('coordinated partner ?');
			} else if (isPoint && !isJoined) {
				console.debug('is unjoined point', isPoint, isJoined);
				const handle = curve.points[pointIndex <= 1 ? 1 : 2];
				handle.x += dx;
				handle.y += dy;
			} else if (isHandle && isJoined && !isAngled && partner?.type === 'BezierConfig') {
				console.log('is smooth joined handle', !isAngled, isJoined, isHandle, partner.type);
				console.debug("isAngled algo", curve.points[pointIndex].pointType, partner.points[pointIndex === 0 ? 3 : 0].pointType)
				// coordinate partner handle
				const [handle, point] =
					pointIndex <= 1 ? [curve.points[1], curve.points[0]] : [curve.points[2], curve.points[3]];
				const [partnerHandle, partnerPoint] =
					pointIndex <= 1
						? [partner.points[2], partner.points[3]]
						: [partner.points[1], partner.points[0]];
				const partnerHandleLength = Math.sqrt(
					Math.pow(partnerHandle.x - partnerPoint.x, 2) +
						Math.pow(partnerHandle.y - partnerPoint.y, 2)
				);
				const handleLength = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
				// const partnerAngle = Math.PI + Math.atan((handle.y - point.y) /  (handle.x - point.x))
				const partnerAngle =
					Math.PI + Math.acos((x - point.x) / handleLength) * (y - point.y < 0 ? -1 : 1);

				// partner handle co linear wtih point->handle, but the length is constant
				partnerHandle.x = partnerPoint.x + Math.cos(partnerAngle) * partnerHandleLength;
				partnerHandle.y = partnerPoint.y + Math.sin(partnerAngle) * partnerHandleLength;
			} else {
				console.log("is angled joined handle", isAngled, isJoined, isHandle)
			}

			// move the point being directly manipulated
			console.log(isPoint, isJoined, isAngled);
			curve.points[pointIndex].x = x;
			curve.points[pointIndex].y = y;
			zCurve.curves[curveIndex] = curve;
		}
	};

	const addBezier = () => {
		const lastPoint = zCurve.curves[zCurve.curves.length -1].points[3]
		lastPoint.pointType = "angled"
		const newCurve: BezierConfig = {
			type: "BezierConfig",
			points: [
				{...lastPoint},
				{type: "PointConfig", x: lastPoint.x + 5, y: lastPoint.y},
				{type: "PointConfig", x: lastPoint.x + 10, y: lastPoint.y},
				{type: "PointConfig", pointType: "angled", x: lastPoint.x + 20, y: lastPoint.y},
			]
		}
		zCurve.curves.push(newCurve)
		$curveConfig = zCurve;
		zCurve = $curveConfig;
	}

	const update = () => {
		$curveConfig = zCurve;
		zCurve = $curveConfig;
	};
</script>



<div class="container">
	<svg
		viewBox={`${canv.minX} ${canv.minY} ${canv.maxX - canv.minX} ${canv.maxY - canv.minY}`}
		style="overflow:visible"
	>
		{#each zCurve.curves as c}
			{#if c.type === 'BezierConfig'}
				<circle cx="0" cy="0" r="2" />
				<path
					d="M {c.points[0].x} {canv.maxY - c.points[0].y}
						 C {c.points[1].x} {canv.maxY - c.points[1].y}, {c.points[2].x} {canv.maxY - c.points[2].y}, {c
						.points[3].x} {canv.maxY - c.points[3].y}"
					stroke="black"
					stroke-width="1"
					fill="transparent"
				/>
				<line
					x1={c.points[0].x}
					y1={canv.maxY - c.points[0].y}
					x2={c.points[1].x}
					y2={canv.maxY - c.points[1].y}
					stroke="red"
					stroke-width=".5"
				/>
				<line
					x1={c.points[2].x}
					y1={canv.maxY - c.points[2].y}
					x2={c.points[3].x}
					y2={canv.maxY - c.points[3].y}
					stroke="red"
					stroke-width=".5"
				/>
			{/if}
		{/each}
	</svg>

	{#each zCurve.curves as curve, curveIndex}
		{#if curve.type === 'BezierConfig'}
			{#each curve.points as point, p}
				<div
					class={`${p === 1 || p === 2 ? 'Handle' : 'Point'} ${
						point.pointType === 'angled' ? 'angled' : 'smooth'
					}`}
					style="left:{point.x}px; top:{canv.maxY - point.y}px"
					on:dragend={update}
					on:dblclick={() => onDoubleClickPoint(p, curveIndex)}
					use:asDraggable={{
						onDragStart: { x: point.x, y: canv.maxY - point.y },
						onDragMove: (x, y, dx, dy) => onDragMove(x, canv.maxY - y, dx, -dy, curveIndex, p),
						minX: 0,
						minY: 0,
						maxX: 400,
						maxY: 400
					}}
				/>
			{/each}
		{/if}
	{/each}
	<button on:click={addBezier}>+</button>
	<button>-</button>
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
		display: block;
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
</style>
