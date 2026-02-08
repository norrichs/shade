<script lang="ts">
	// @ts-expect-error
	import outline from 'svg-path-outline';
	import { generateBranched } from '$lib/patterns';
	import type { BandCutPattern, Quadrilateral } from '$lib/types';
	import Midline from './Midline.svelte';
	import Outline from './Outline.svelte';
	import Branches from './Branches.svelte';

	let {
		band,
		minWidth,
		maxWidth,
		variant,
		bandIndex,
		outlined
	}: {
		band: BandCutPattern;
		minWidth: number;
		maxWidth: number;
		variant: number;
		bandIndex: number;
		outlined: boolean;
	} = $props();

	let pathObject = $derived(generateBranched(band.facets.map((f) => f.quad) as Quadrilateral[], {
		rows: 1,
		columns: 1,
		variant,
		minWidth,
		maxWidth
	}));
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
