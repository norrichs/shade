<script lang="ts">
	import { processSvg } from './svg-text';
	import Fonts from './fonts';

	export let fontName: keyof typeof Fonts = 'font1';
	export let value: string;
	export let angle: number;
	export let color = 'black';

	const dict = processSvg(Fonts[fontName].keyString, Fonts[fontName].svgString);
</script>

{#each value.split('').map((c) => (c === ' ' ? '_' : c)) as char, i}
	<g transform={`rotate(25) scale(20)`} fill={color}>
		<path d={dict[char].svgPath} transform={`translate(${i * 0.5},0)`} />
	</g>
{/each}
