<script lang="ts">
	import type { BezierConfig } from '$lib/types';
	import PointInput from './PointInput.svelte';
	import type { PointInputMode } from './path-editor-ui-store';
	import type { PathEditorCanvas, PathEditorConfig } from './path-editor';

	let {
		curveDef,
		displayCurveDef,
		canv,
		config,
		mode,
		onChangeMode,
		onChangePoint
	}: {
		curveDef: BezierConfig[];
		displayCurveDef: BezierConfig[];
		canv: PathEditorCanvas;
		config: PathEditorConfig;
		mode: PointInputMode;
		onChangeMode: (mode: PointInputMode) => void;
		onChangePoint: (x: number, y: number, curveIndex: number, pointIndex: number) => void;
	} = $props();

	const names = ['anchor', 'handle', 'handle', 'anchor'];
</script>

<div class={`point-inputs ${mode}`}>
	<div class="mode">
		<button
			class:active={mode === 'inline'}
			onclick={() => onChangeMode('inline')}
			title="Place the inputs on their points">inline</button
		>
		<button
			class:active={mode === 'outrigger'}
			onclick={() => onChangeMode('outrigger')}
			title="List the inputs beside the canvas">outrigger</button
		>
	</div>
	<div class="fields">
		{#each curveDef as curve, curveIndex}
			{#each curve.points as point, pointIndex}
				<PointInput
					{point}
					displayPoint={displayCurveDef[curveIndex].points[pointIndex]}
					{canv}
					{config}
					inline={mode === 'inline'}
					label={`${curveIndex}.${names[pointIndex]}`}
					onChange={(x, y) => onChangePoint(x, y, curveIndex, pointIndex)}
				/>
			{/each}
		{/each}
	</div>
</div>

<style>
	.point-inputs.outrigger .fields {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 300px;
		overflow-y: auto;
	}
	.mode {
		display: flex;
		gap: 4px;
		padding-bottom: 4px;
	}
	button.active {
		font-weight: bold;
		text-decoration: underline;
	}
</style>
