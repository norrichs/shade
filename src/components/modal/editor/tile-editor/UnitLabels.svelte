<script lang="ts">
	import type { UnitDefinition } from '$lib/patterns/spec-types';
	import type { Vertex } from '../segment-vertices';
	import { flatIndexes } from '../vertex-addressing';

	let {
		unit,
		vertices,
		placement = 'above'
	}: {
		unit: UnitDefinition;
		vertices: Vertex[];
		placement?: 'above' | 'below';
	} = $props();

	const OFFSET = 0.7;
	const FONT_SIZE = 0.8;

	const labelY = $derived((y: number) => (placement === 'above' ? y - OFFSET : y + OFFSET));
	const dominantBaseline = $derived(placement === 'above' ? 'text-after-edge' : 'text-before-edge');
	const opacity = $derived(placement === 'above' ? 0.6 : 0.4);

	const corners = $derived([
		{ label: 'a', x: 0, y: unit.height },
		{ label: 'b', x: unit.width, y: unit.height },
		{ label: 'c', x: unit.width, y: 0 },
		{ label: 'd', x: 0, y: 0 }
	]);
</script>

{#each vertices as vertex (vertex.x + ':' + vertex.y)}
	<text
		x={vertex.x}
		y={labelY(vertex.y)}
		font-size={FONT_SIZE}
		text-anchor="middle"
		dominant-baseline={dominantBaseline}
		fill="rgba(0, 0, 0, {opacity})"
		pointer-events="none"
		style="user-select: none;">{flatIndexes(unit, vertex).join(',')}</text
	>
{/each}

{#each corners as corner (corner.label)}
	<text
		x={corner.x}
		y={labelY(corner.y)}
		font-size={FONT_SIZE}
		text-anchor="middle"
		dominant-baseline={dominantBaseline}
		fill="rgba(0, 0, 0, {opacity})"
		pointer-events="none"
		style="user-select: none;">{corner.label}</text
	>
{/each}
