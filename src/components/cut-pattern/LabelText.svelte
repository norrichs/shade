<script lang="ts">
	import type { Point } from '$lib/types';
	import SvgText from './SvgText/SvgText.svelte';

	let {
		lines = [],
		size = 5,
		anchor,
		color = 'black',
		element = $bindable(undefined),
		transform = undefined
	}: {
		lines?: string[];
		size?: number;
		anchor: Point;
		color?: string;
		element?: SVGGElement | undefined;
		transform?: string | undefined;
	} = $props();
</script>

<g bind:this={element} {transform}>
	{#each lines as lineString, i}
		<SvgText string={lineString} anchor={{ ...anchor, y: anchor.y + 7 * (i + 1) }} {size} {color} />
	{/each}
</g>
