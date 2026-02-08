<script lang="ts">
	import type { BezierConfig } from '$lib/types';
	import { addControlPoint, type PathEditorCanvas } from './path-editor';

	let {
		curveDef,
		onChangeCurveDef,
		id = undefined,
		canv
	}: {
		curveDef: BezierConfig[];
		onChangeCurveDef: (curveDef: BezierConfig[]) => void;
		id?: string | undefined;
		canv: PathEditorCanvas;
	} = $props();

	let hover = $state(false);

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
	let pathString = $derived(getPathString(curveDef));
</script>

<g fill="none">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<path
		class="hover-path"
		d={pathString}
		stroke-width={10 * canv.scale}
		stroke="transparent"
		onclick={handleCurveOnClick}
		onmouseenter={() => (hover = true)}
		onmouseleave={() => (hover = false)}
	/>
	<path {id} d={pathString} stroke-width={1 * canv.scale} stroke="black" />
</g>

<style>
	.hover-path {
		cursor: crosshair;
	}
</style>
