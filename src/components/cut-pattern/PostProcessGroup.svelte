<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PageRect } from '#lib/cut-pattern/page-layout/types.js';
	import { setPostProcessScope } from './post-process-scope';

	let {
		index,
		offsetY,
		pages,
		label,
		children
	}: {
		/** Position in the post-process list; fixed for this component's life. */
		index: number;
		offsetY: number;
		/** The group's pages, before `offsetY`: used only to place the title. */
		pages: PageRect[];
		/** Screen-only title; omitted when there is a single group. */
		label?: string;
		children: Snippet;
	} = $props();

	// svelte-ignore state_referenced_locally
	setPostProcessScope(index);

	let titleAt = $derived.by(() => {
		if (!label || pages.length === 0) return undefined;
		const x = Math.min(...pages.map((p) => p.x));
		const y = Math.min(...pages.map((p) => p.y));
		const size = Math.max(...pages.map((p) => p.height)) * 0.06;
		return { x, y: y - size * 0.4, size };
	});
</script>

<g class="post-process-group" data-post-process={index} transform="translate(0 {offsetY})">
	{#if titleAt}
		<text
			class="screen-only post-process-group-title"
			x={titleAt.x}
			y={titleAt.y}
			font-size={titleAt.size}>{label}</text
		>
	{/if}
	{@render children()}
</g>

<style>
	.post-process-group-title {
		fill: #666;
		font-family: sans-serif;
		pointer-events: none;
	}
</style>
