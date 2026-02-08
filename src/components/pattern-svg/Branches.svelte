<script lang="ts">
	import type { DynamicPath } from '$lib/patterns/patterns';
	// @ts-expect-error
	import outline from 'svg-path-outline';

	let {
		branches,
		outlined,
		bandIndex = 0,
		fillColor = 'red'
	}: { branches: DynamicPath; outlined: boolean; bandIndex?: number; fillColor?: string } =
		$props();
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
