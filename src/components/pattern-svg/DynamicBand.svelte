<script lang="ts">
	// @ts-expect-error
	import outline from 'svg-path-outline';
	import { generateBranched } from '$lib/patterns/patterns';
	import type { PatternedBand, Quadrilateral } from '$lib/types';
	import Midline from './Midline.svelte';
	import Outline from './Outline.svelte';
	import Branches from './Branches.svelte';

	export let band: PatternedBand;
	export let minWidth: number;
	export let maxWidth: number;
	export let variant: number;
	export let bandIndex: number;
	export let outlined: boolean;

	$: pathObject = generateBranched(band.facets.map((f) => f.quad) as Quadrilateral[], {
		rows: 1,
		columns: 1,
		variant,
		minWidth,
		maxWidth
	});
</script>

<g>
	<defs>
		<clipPath id={`outline-clip-inside-${bandIndex}`}>
			<path d={pathObject.outlineShape[0].svgPath} />
		</clipPath>
		<clipPath id={`outline-clip-outside-${bandIndex}`}>
			<path
				d={`${outline(pathObject.outlineShape[0].svgPath, pathObject.outlineShape[0].width, {
					joints: 0,
					bezierAccuracy: 3,
					inside: true,
					outside: true,
					tagName: 'path'
				})} ${pathObject.outlineShape[0].svgPath}`}
				clip-rule="evenodd"
			/>
		</clipPath>
	</defs>
	<Outline
		outlineShape={pathObject.outlineShape}
		outlineSegments={pathObject.outline}
		{outlined}
		{bandIndex}
	/>
	<Midline midline={pathObject.midLine} {bandIndex} {outlined} />
	<Branches branches={pathObject.branches} {bandIndex} {outlined} />
</g>
