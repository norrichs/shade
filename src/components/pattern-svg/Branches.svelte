<script lang="ts">
	import type { DynamicPath, DynamicPathCollection } from '$lib/patterns/patterns';
	// @ts-expect-error
	import outline from 'svg-path-outline';

	// export let paths: DynamicPathCollection;
	export let branches: DynamicPath;
	export let outlined: boolean;
	export let bandIndex = 0;
	export let fillColor = 'red';
</script>

<g stroke-linecap="round" stroke-linejoin="round" fill="red" stroke="none">
	{#each branches as branch, i}
		<path
			clip-path={`url(#outline-clip-inside-${bandIndex})`}
			id={`stubby-path-${i}`}
			d={outlined
				? outline(branch.svgPath, branch.width / 2, {
						joints: 0,
						bezierAccuracy: 3,
						inside: true,
						outside: false,
						tagName: 'path'
				  })
				: branch.svgPath}
			stroke={outlined ? 'none' : fillColor}
			stroke-width={outlined ? 0 : branch.width}
			fill={outlined ? fillColor : 'none'}
		/>
	{/each}
</g>
