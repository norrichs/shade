<script lang="ts">
	import { getChars, processSvg } from './svg-text';
	import Fonts from './fonts';
	import type { Point } from '$lib/types';
	import { svgTextDictionary } from './svg-text-store';

	export let id: string | undefined = undefined;
	export let fontName: keyof typeof Fonts = 'reliefSingleLine';
	export let string: string;
	export let angle: number = 0;
	export let size: number = 20;
	export let color = 'black';
	export let anchor: Point = { x: 0, y: 0 };
	export let offset: { x: number | 'center'; y: number | 'center' } = { x: 'center', y: 0 };
	export let strokeWidth: number = 1;

	const dict = $svgTextDictionary;
	$: xOffset = offset.x === 'center' ? -characterPaths.totalWidth / 2 : offset.x;
	$: yOffset = offset.y === 'center' ? -0.5 : offset.y;
	$: characterPaths = getChars(string, dict);
</script>

<g
	transform={`translate(${anchor.x} ${anchor.y}) rotate(${angle}) scale(${size})`}
	fill="none"
	stroke-width={strokeWidth / 10}
	stroke={color}
>
	<g transform={`translate(${xOffset}, ${yOffset})`}>
		{#each characterPaths.chars as { char, offset, charId }, i}
			<path data-char-id={charId} d={char} transform={`translate(${offset}, 0)`} />
		{/each}
	</g>
</g>
