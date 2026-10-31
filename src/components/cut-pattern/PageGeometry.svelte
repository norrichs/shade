<script lang="ts">
	import type { PageRect } from '#lib/cut-pattern/page-layout/types.js';
	import {
		REGISTRATION_MARK_MM,
		pageNumberRect,
		registrationMarkPath,
		registrationMarkRect
	} from '#lib/cut-pattern/page-layout/registration-mark.js';
	import {
		placePageNumber,
		type GlyphDict
	} from '#lib/cut-pattern/page-post-process/page-label.js';
	import { svgPathStringFromSegments } from '#lib/patterns/utils.js';
	import { layerStrokes } from '#lib/stores/index.js';
	import SvgText from './SvgText/SvgText.svelte';

	let {
		page,
		pageIndex,
		marginPx = 0,
		markSize,
		dict
	}: {
		page: PageRect;
		/** Zero-based; drawn as `pageIndex + 1` under the mark. */
		pageIndex: number;
		marginPx?: number;
		/** Registration-mark side in pattern units; absent when marks are off. */
		markSize?: number;
		/** Stroke-font glyphs; the page number is skipped until they are ready. */
		dict?: GlyphDict;
	} = $props();

	let markRect = $derived(markSize ? registrationMarkRect(page, marginPx, markSize) : undefined);
	// The mark is REGISTRATION_MARK_MM wide, so its side gives the page scale.
	let pageNumber = $derived(
		markRect && markSize && dict
			? placePageNumber(pageIndex, pageNumberRect(markRect, markSize / REGISTRATION_MARK_MM), dict)
			: undefined
	);
</script>

<g class="page-geometry">
	<rect
		x={page.x}
		y={page.y}
		width={page.width}
		height={page.height}
		fill="#ffffff"
		data-geometry="page-outline"
		stroke={$layerStrokes['page-outline']}
		stroke-width="1"
		vector-effect="non-scaling-stroke"
	/>
	{#if markRect}
		<path
			d={svgPathStringFromSegments(registrationMarkPath(markRect))}
			data-geometry="registration-mark"
			fill="none"
			stroke={$layerStrokes['registration-mark']}
			stroke-width={1}
		/>
	{/if}
	{#if pageNumber}
		<SvgText
			string={pageNumber.text}
			anchor={pageNumber.origin}
			size={pageNumber.size}
			offset={{ x: 0, y: 0 }}
			geometry="page-label"
		/>
	{/if}
</g>
