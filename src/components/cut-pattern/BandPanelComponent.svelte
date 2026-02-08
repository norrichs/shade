<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { BandPanelPattern } from '$lib/types';
	import { printProjectionAddress } from '$lib/projection-geometry/generate-projection';

	let {
		band,
		index,
		offsetX,
		offsetY,
		correctAngle = true,
		showBounds = false,
		children
	}: {
		band: BandPanelPattern;
		index: number;
		offsetX: number;
		offsetY: number;
		correctAngle?: boolean;
		showBounds?: boolean;
		children?: Snippet;
	} = $props();

	let colors = {
		default: 'orange',
		hovered: 'blue',
		focused: 'rebeccapurple'
	};

	let color = colors.default;
	let isFocused = false;
	let isHovered = false;
</script>

<g
	transform={`translate(${offsetX} ${offsetY}) scale(1,1) rotate(0)`}
	id={printProjectionAddress(band.address)}
	role="group"
	stroke={color}
>
	{#if band.bounds && showBounds}
		<rect
			x={band.bounds.left}
			y={band.bounds.top}
			width={band.bounds.width}
			height={band.bounds.height}
			fill="rgba(0, 0, 0, 0.05)"
			stroke="red"
			stroke-width={0.1}
		/>
	{/if}
	{@render children?.()}
</g>
