<script lang="ts">
	import { getChars, processSvg } from './svg-text';
	import Fonts from './fonts';
	import type { Point } from '$lib/types';
	import { svgTextDictionary } from './svg-text-store';
	import { onMount } from 'svelte';

	export let id: string | undefined = undefined;
	export let fontName: keyof typeof Fonts = 'reliefSingleLine';
	export let string: string;
	export let angle: number = 0;
	export let size: number = 20;
	export let color: string = 'black';
	export let anchor: Point = { x: 0, y: 0 };
	export let offset: { x: number | 'center'; y: number | 'center' } = { x: 'center', y: 0 };
	export let strokeWidth: number = 1;
	// export let portal: { target: string; transform: string } | undefined = undefined;

	let dict = $svgTextDictionary;
	if (!dict) {
		$svgTextDictionary = processSvg(Fonts[fontName].keyString, Fonts[fontName].svgString);
		dict = $svgTextDictionary;
	}

	console.debug('id', id);

	$: xOffset = offset.x === 'center' ? -characterPaths.totalWidth / 2 : offset.x;
	$: yOffset = offset.y === 'center' ? -0.5 : offset.y;
	$: characterPaths = getChars(string, dict);
</script>

<g
	transform={`translate(${anchor.x} ${anchor.y}) rotate(${angle}) scale(${size})`}
	fill="none"
	stroke-width={strokeWidth / size}
	stroke={color}
	{id}
>
	<g transform={`translate(${xOffset}, ${yOffset})`} data-test-id="svg-text">
		{#each characterPaths.chars as { char, offset, charId }, i}
			<path data-char-id={charId} d={char} transform={`translate(${offset}, 0)`} />
		{/each}
	</g>
</g>
