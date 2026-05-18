<script lang="ts">
	import type { Point } from '$lib/types';
	import SvgText from './SvgText/SvgText.svelte';
	import { onDestroy } from 'svelte';

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

	// Hold a stable reference to the rendered <g>. The parent (PatternLabel)
	// may relocate this element into a portal container via appendChild,
	// which detaches it from Svelte's normal cleanup path. Snapshotting the
	// node lets us remove it (and its SvgText children) on destroy even if
	// the bindable `element` has already been reset by the time we run.
	let ownElement: SVGGElement | undefined;

	$effect(() => {
		if (element) ownElement = element;
	});

	onDestroy(() => {
		ownElement?.remove();
	});
</script>

<g bind:this={element} {transform}>
	{#each lines as lineString, i}
		<SvgText string={lineString} anchor={{ ...anchor, y: anchor.y + 7 * (i + 1) }} {size} {color} />
	{/each}
</g>
