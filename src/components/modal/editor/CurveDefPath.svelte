<script lang="ts">
	import type { BezierConfig } from '$lib/types';
	import { addControlPoint, type PathEditorCanvas } from './path-editor';

	export let curveDef: BezierConfig[];
	export let onChangeCurveDef: (curveDef: BezierConfig[]) => void;
	export let id: string | undefined = undefined;
	export let canv: PathEditorCanvas;

	let hover = false;

	const handleCurveOnClick = (event: MouseEvent) => {
		console.debug('handleCurveOnClick', event, canv, event.offsetX, event.offsetY);
		const x = canv.viewBoxData.left + event.offsetX;
		const y = canv.viewBoxData.top + event.offsetY;
		const newCurveDef = addControlPoint(curveDef, x, y);
		onChangeCurveDef(newCurveDef);
	};

	const getPathString = (curveDef: BezierConfig[]) => {
		return curveDef.reduce((pathString, curve) => {
			return (
				pathString +
				`C ${curve.points[1].x} ${curve.points[1].y} ${curve.points[2].x} ${curve.points[2].y} ${curve.points[3].x} ${curve.points[3].y}`
			);
		}, `M ${curveDef[0].points[0].x} ${curveDef[0].points[0].y}`);
	};
	$: pathString = getPathString(curveDef);
</script>

<g fill="none">
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<path
		class="hover-path"
		d={pathString}
		stroke-width={10 * canv.scale}
		stroke="transparent"
		on:click={handleCurveOnClick}
		on:mouseenter={() => (hover = true)}
		on:mouseleave={() => (hover = false)}
	/>
	<path {id} d={pathString} stroke-width={1 * canv.scale} stroke="black" />
</g>

<style>
	.hover-path {
		cursor: crosshair;
	}
</style>
