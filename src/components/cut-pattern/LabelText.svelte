<script lang="ts">
	import type { Point } from '$lib/types';
	import SvgText from './SvgText/SvgText.svelte';
	import type { GeometryType } from '$lib/cut-pattern/post-process-types';

	let {
		lines = [],
		size = 5,
		anchor,
		geometry = undefined,
		element = $bindable(undefined),
		transform = undefined
	}: {
		lines?: string[];
		size?: number;
		anchor: Point;
		geometry?: GeometryType;
		element?: SVGGElement | undefined;
		transform?: string | undefined;
	} = $props();
</script>

<g bind:this={element} {transform}>
	{#each lines as lineString, i}
		<SvgText
			string={lineString}
			anchor={{ ...anchor, y: anchor.y + (size / 2) * (i + 1) }}
			{size}
			{geometry}
		/>
	{/each}
</g>
