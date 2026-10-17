<script lang="ts">
	import { getChars, processSvg } from './svg-text';
	import Fonts from './fonts';
	import type { Point } from '#lib/types.js';
	import { svgTextDictionary } from './svg-text-store';
	import { onMount, untrack } from 'svelte';
	import type { GeometryType } from '#lib/cut-pattern/post-process-types.js';
	import { layerStrokes } from '#lib/stores/index.js';

	let {
		id = undefined,
		fontName = 'reliefSingleLine',
		string,
		angle = 0,
		size = 20,
		geometry = 'label-text',
		anchor = { x: 0, y: 0 },
		offset = { x: 'center', y: 0 },
		strokeWidth = 1
	}: {
		id?: string | undefined;
		fontName?: keyof typeof Fonts;
		string: string;
		angle?: number;
		size?: number;
		geometry?: GeometryType;
		anchor?: Point;
		offset?: { x: number | 'center'; y: number | 'center' };
		strokeWidth?: number;
	} = $props();

	// The glyph dictionary is a one-time, app-wide init: whichever font the first
	// mounted SvgText names seeds it, and later fontName changes don't rebuild it.
	let dict = $svgTextDictionary;
	if (!dict) {
		const font = Fonts[untrack(() => fontName)];
		$svgTextDictionary = processSvg(font.keyString, font.svgString);
		dict = $svgTextDictionary;
	}

	let characterPaths = $derived(getChars(string, dict));
	let xOffset = $derived(offset.x === 'center' ? -characterPaths.totalWidth / 2 : offset.x);
	let yOffset = $derived(offset.y === 'center' ? -0.5 : offset.y);
</script>

<!-- Glyph strokes are non-scaling: `strokeWidth` screen pixels whatever the
     font size, page scale or zoom. `vector-effect` does not inherit, so it sits
     on each path. -->
<g
	transform={`translate(${anchor.x} ${anchor.y}) rotate(${angle}) scale(${size})`}
	fill="none"
	stroke={$layerStrokes[geometry]}
	{id}
>
	<g transform={`translate(${xOffset}, ${yOffset})`} data-test-id="svg-text">
		{#each characterPaths.chars as { char, offset, charId }, i (i)}
			<path
				data-char-id={charId}
				data-geometry={geometry}
				d={char}
				transform={`translate(${offset}, 0)`}
				stroke-width={strokeWidth}
				vector-effect="non-scaling-stroke"
			/>
		{/each}
	</g>
</g>
