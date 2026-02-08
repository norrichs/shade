<script lang="ts">
	import type { DynamicPath } from '$lib/patterns/patterns';
	// @ts-expect-error
	import outline from 'svg-path-outline';

	let {
		outlineSegments,
		outlineShape,
		outlined,
		bandIndex = 0,
		fillColor = 'red'
	}: {
		outlineSegments: DynamicPath;
		outlineShape: DynamicPath;
		outlined: boolean;
		bandIndex?: number;
		fillColor?: string;
	} = $props();
</script>

{#if outlineSegments && outlineShape}
	<g stroke-linecap="round" stroke-linejoin="round">
		<g fill="red" stroke="none">
			{#each outlineSegments as path, i}
				<path
					clip-path={`url(#outline-clip-outside-${bandIndex})`}
					id={`stubby-path-${i}`}
					d={outlined
						? outline(path.svgPath, path.width / 2, {
								joints: 0,
								bezierAccuracy: 3,
								inside: true,
								outside: false,
								tagName: 'path'
							})
						: path.svgPath}
					stroke={outlined ? 'none' : fillColor}
					stroke-width={outlined ? 0 : outlineShape[0].width}
					fill={outlined ? fillColor : 'none'}
				/>
			{/each}
		</g>

		<path
			clip-path={`url(#outline-clip-inside-${bandIndex})`}
			d={outlined
				? outline(`${outlineShape[0].svgPath} Z`, outlineShape[0].width / 2, {
						joints: 0,
						bezierAccuracy: 3,
						inside: true,
						outside: true,
						tagName: 'path'
					})
				: outlineShape[0].svgPath}
			fill-rule="evenodd"
			stroke={outlined ? 'none' : fillColor}
			stroke-width={outlined ? 0 : outlineShape[0].width}
			fill={outlined ? fillColor : 'none'}
		/>
	</g>
{/if}
