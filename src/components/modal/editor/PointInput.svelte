<script lang="ts">
	import type { PointConfig2 } from '$lib/types';
	import type { PathEditorCanvas, PathEditorConfig } from './path-editor';

	let {
		point,
		displayPoint,
		canv,
		config,
		inline = false,
		label = undefined,
		onChange
	}: {
		/** Stored coordinates — what the user types and reads. */
		point: PointConfig2;
		/** Rendered coordinates, used only to place the inputs over the canvas. */
		displayPoint: PointConfig2;
		canv: PathEditorCanvas;
		config: PathEditorConfig;
		inline?: boolean;
		label?: string;
		onChange: (x: number, y: number) => void;
	} = $props();

	// Same formula as DraggablePoint, so an inline input sits on its point.
	let left = $derived((-canv.minX - config.gutter + displayPoint.x) / canv.scale);
	let top = $derived((-canv.minY - config.gutter + displayPoint.y) / canv.scale);

	const commit = (event: Event, axis: 'x' | 'y') => {
		const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
		if (Number.isNaN(value)) return;
		onChange(axis === 'x' ? value : point.x, axis === 'y' ? value : point.y);
	};
</script>

<div class="point-input" class:inline style={inline ? `left:${left}px; top:${top}px` : ''}>
	{#if label && !inline}<span class="label">{label}</span>{/if}
	<input type="number" value={point.x} onchange={(event) => commit(event, 'x')} />
	<input type="number" value={point.y} onchange={(event) => commit(event, 'y')} />
</div>

<style>
	.point-input {
		display: flex;
		flex-direction: row;
		gap: 2px;
		align-items: center;
	}
	.point-input.inline {
		position: absolute;
		transform: translate(-50%, -50%);
		background-color: rgba(255, 255, 255, 0.85);
		z-index: 1;
	}
	.point-input input {
		width: 60px;
	}
	.point-input.inline input {
		width: 44px;
	}
	.label {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.85em;
		min-width: 34px;
	}
</style>
