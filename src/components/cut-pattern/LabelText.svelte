<script lang="ts">
	import type { Point } from '$lib/types';
	import SvgText from './SvgText/SvgText.svelte';

	export let lines: string[] = [];
	export let size: number = 5;
	export let anchor: Point;
	export let color: string = 'black';
	export let element: SVGGElement | undefined = undefined;
	export let transform: string | undefined = undefined;
</script>

<g bind:this={element} {transform}>
	{#each lines as lineString, i}
		<SvgText string={lineString} anchor={{ ...anchor, y: anchor.y + 7 * (i + 1) }} {size} {color} />
	{/each}
</g>
