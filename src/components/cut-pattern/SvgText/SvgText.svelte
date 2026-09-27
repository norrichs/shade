<script lang="ts">
	import { getChars, processSvg } from './svg-text';
	import Fonts from './fonts';
	import type { Point } from '$lib/types';
	import { svgTextDictionary } from './svg-text-store';
	import { onMount } from 'svelte';
	import type { GeometryType } from '$lib/cut-pattern/post-process-types';
	import { layerStrokes } from '$lib/stores';

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

	let dict = $svgTextDictionary;
	if (!dict) {
		$svgTextDictionary = processSvg(Fonts[fontName].keyString, Fonts[fontName].svgString);
		dict = $svgTextDictionary;
	}

	let characterPaths = $derived(getChars(string, dict));
	let xOffset = $derived(offset.x === 'center' ? -characterPaths.totalWidth / 2 : offset.x);
	let yOffset = $derived(offset.y === 'center' ? -0.5 : offset.y);
</script>

<g
	transform={`translate(${anchor.x} ${anchor.y}) rotate(${angle}) scale(${size})`}
	fill="none"
	stroke-width={strokeWidth / size}
	stroke={$layerStrokes[geometry]}
	{id}
>
	<g transform={`translate(${xOffset}, ${yOffset})`} data-test-id="svg-text">
		{#each characterPaths.chars as { char, offset, charId }, i}
			<path
				data-char-id={charId}
				data-geometry={geometry}
				d={char}
				transform={`translate(${offset}, 0)`}
			/>
		{/each}
	</g>
</g>
