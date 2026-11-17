<script lang="ts">
	// @ts-expect-error -- the package's "exports" map hides its bundled .d.ts
	import { asDraggable } from 'svelte-drag-and-drop-actions';
	import { transparentDragImage } from '#lib/drag-image.js';

	/**
	 * A draggable pane divider, absolutely positioned inside `container` (which
	 * must be `position: relative`). Reports the new divider position as a
	 * fraction of the container along the drag axis; the caller clamps and stores
	 * it. Styled like designer2's divider: invisible until hovered or dragged,
	 * with a grip that follows the cursor along the divider.
	 */
	let {
		orientation,
		position,
		container,
		onchange,
		extent = 1
	}: {
		/** `vertical` = a column divider dragged left/right. */
		orientation: 'vertical' | 'horizontal';
		/** Divider position, fraction of the container along the drag axis. */
		position: number;
		container: HTMLElement | undefined;
		onchange: (fraction: number) => void;
		/** How far the divider runs along its own length, fraction of the container. */
		extent?: number;
	} = $props();

	let dragging = $state(false);
	/** Grip position along the divider, px, so it sits under the cursor. */
	let grip = $state(0);

	const vertical = $derived(orientation === 'vertical');
	const size = () =>
		container ? (vertical ? container.clientWidth : container.clientHeight) : 0;
	const report = (x: number, y: number) => {
		const s = size();
		if (s > 0) onchange((vertical ? x : y) / s);
	};
</script>

<div
	class="divider"
	class:vertical
	class:horizontal={!vertical}
	class:dragging
	style:left={vertical ? `calc(${position} * 100%)` : '0'}
	style:top={vertical ? '0' : `calc(${position} * 100%)`}
	style:height={vertical ? `calc(${extent} * 100%)` : undefined}
	style:width={vertical ? undefined : `calc(${extent} * 100%)`}
	role="separator"
	aria-orientation={orientation}
	aria-valuenow={Math.round(position * 100)}
	onpointermove={(ev: PointerEvent & { currentTarget: EventTarget & HTMLDivElement }) => {
		if (dragging) return;
		const r = ev.currentTarget.getBoundingClientRect();
		grip = vertical ? ev.clientY - r.top : ev.clientX - r.left;
	}}
	use:asDraggable={{
		relativeTo: 'parent',
		Dummy: transparentDragImage(),
		onDragStart: () => {
			dragging = true;
			const p = position * size();
			return vertical ? { x: p, y: grip } : { x: grip, y: p };
		},
		onDragMove: (x: number, y: number) => {
			report(x, y);
			grip = vertical ? y : x;
		},
		onDragEnd: (x: number, y: number) => {
			report(x, y);
			grip = vertical ? y : x;
			dragging = false;
		}
	}}
>
	<div
		class="handle"
		style:top={vertical ? `${grip}px` : '50%'}
		style:left={vertical ? '50%' : `${grip}px`}
	></div>
</div>

<style>
	.divider {
		--divider-hit-width: 20px;
		position: absolute;
		z-index: 10;
	}
	.divider.vertical {
		width: var(--divider-hit-width);
		transform: translateX(-50%);
		cursor: col-resize;
	}
	.divider.horizontal {
		height: var(--divider-hit-width);
		transform: translateY(-50%);
		cursor: row-resize;
	}
	.handle {
		position: absolute;
		transform: translate(-50%, -50%);
		border-radius: 4.5px;
		background: #555;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
		opacity: 0;
		transition: opacity 120ms;
	}
	.vertical .handle {
		width: 9px;
		height: 48px;
	}
	.horizontal .handle {
		width: 48px;
		height: 9px;
	}
	.divider::before {
		content: '';
		position: absolute;
		background: #555;
		opacity: 0;
		transition: opacity 120ms;
	}
	.vertical::before {
		top: 0;
		bottom: 0;
		left: 50%;
		width: 2px;
		transform: translateX(-50%);
	}
	.horizontal::before {
		left: 0;
		right: 0;
		top: 50%;
		height: 2px;
		transform: translateY(-50%);
	}
	.divider:hover .handle,
	.divider.dragging .handle,
	.divider:hover::before,
	.divider.dragging::before {
		opacity: 1;
	}
</style>
