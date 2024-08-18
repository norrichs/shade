<script lang="ts">
	// @ts-expect-error
	import outline from 'svg-path-outline';
	import type { DynamicPath } from '$lib/patterns/patterns';

	export let midline: DynamicPath;
	export let bandIndex: number;
	export let outlined: boolean;
</script>

<g
	fill="green"
	stroke={outlined ? 'none' : 'limegreen'}
	stroke-linecap="round"
	stroke-linejoin="round"
>
	{#each midline as path, i}
		<path
			clip-path={`url(#outline-clip-inside-${bandIndex})`}
			id={`midline-path-${bandIndex}-${i}`}
			d={outlined
				? outline(path.svgPath, path.width / 2, {
						joints: 0,
						bezierAccuracy: 3,
						inside: true,
						outside: false,
						tagName: 'path'
				  })
				: path.svgPath}
			stroke-width={outlined ? 0 : path.width}
		/>
	{/each}
</g>
