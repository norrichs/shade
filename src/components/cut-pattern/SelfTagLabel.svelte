<script lang="ts">
	import type { Point } from '$lib/types';
	import { tick } from 'svelte';
	import SvgText from './SvgText/SvgText.svelte';

	// Self-tag label: renders the band's `t/b` address as SvgText surrounded by a
	// text-fitted outline-only rectangle. The rect dimensions are derived from
	// the SvgText's measured bbox plus a configurable padding margin.
	let {
		text,
		anchor,
		angle = 0,
		scale = 1,
		padding = 10,
		color = 'black'
	}: {
		text: string;
		anchor: Point;
		angle?: number;
		scale?: number;
		padding?: number;
		color?: string;
	} = $props();

	// Font size for the SvgText. The outer group `scale` multiplies the whole
	// rendered tag (text + outline). FONT_SIZE is the intrinsic text size; the
	// `scale` prop scales the assembled group via transform.
	const FONT_SIZE = 20;
	const STROKE_WIDTH = 1;

	let textWrapper: SVGGElement | undefined = $state();
	let bbox: { x: number; y: number; width: number; height: number } = $state({
		x: 0,
		y: 0,
		width: 0,
		height: 0
	});
	let measured = $state(false);

	const measure = async () => {
		if (!text || !textWrapper) return;
		await tick();
		try {
			const b = textWrapper.getBBox();
			if (b.width === 0 || b.height === 0) {
				measured = true;
				return;
			}
			bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
			measured = true;
		} catch {
			measured = true;
		}
	};

	$effect(() => {
		// Re-measure on any input change that affects rendered text geometry.
		void text;
		void textWrapper;
		void measure();
	});

	let angleDeg = $derived((angle * 180) / Math.PI);
</script>

{#if text}
	<g
		transform={`translate(${anchor.x} ${anchor.y}) rotate(${angleDeg}) scale(${scale})`}
		style="visibility: {measured ? 'visible' : 'hidden'};"
	>
		{#if measured && bbox.width > 0 && bbox.height > 0}
			<rect
				x={bbox.x - padding}
				y={bbox.y - padding}
				width={bbox.width + padding * 2}
				height={bbox.height + padding * 2}
				fill="none"
				stroke={color}
				stroke-width={STROKE_WIDTH}
			/>
		{/if}
		<g bind:this={textWrapper} style="pointer-events: none;">
			<SvgText
				string={text}
				size={FONT_SIZE}
				{color}
				anchor={{ x: 0, y: 0 }}
				offset={{ x: 'center', y: 'center' }}
			/>
		</g>
	</g>
{/if}
