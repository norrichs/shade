<script lang="ts">
	import { printProjectionAddress } from '$lib/projection-geometry/generate-projection';
	import type { HingePattern, PanelPattern } from '$lib/types';
	import SvgText from './SvgText/SvgText.svelte';

	export let hingePattern: HingePattern;
	export let panel: PanelPattern;
	export let showTriangles = false;

	const getOutlinePath = (outline: HingePattern['pattern']['outline']) => {
		const path = outline.reduce((path, point, index) => {
			if (index === 0) {
				return `M ${point.x} ${point.y}`;
			}
			return `${path} L ${point.x} ${point.y}`;
		}, '');
		return path;
	};

	const getHexPath = (x: number, y: number, radius: number) => {
		let path = "";
		for (let i = 0; i < 6; i++) {
			const angle = (i * Math.PI) / 3;
			const nextX = x + radius * Math.cos(angle);
			const nextY = y + radius * Math.sin(angle);
			path += ` ${i ===0 ? "M" : "L"} ${nextX} ${nextY}`;
		}
		path += ` Z`;
		return path;
	};

	const colors = {
		ab: 'rgba(255, 69, 0, .1)',
		bc: 'rgba(0, 69, 200, .1)',
		ac: 'rgba(0, 200, 69, .1)'
	};

	$: outlinePath = getOutlinePath(hingePattern.pattern.outline);
</script>

<path d={outlinePath} stroke="none" stroke-width="0.2" fill={colors[hingePattern.edge]} />
{#if showTriangles}
	{#if hingePattern.pattern.partnerBackFaceTriangle}
		<path
			d={`M ${hingePattern.pattern.partnerBackFaceTriangle.a.x} ${hingePattern.pattern.partnerBackFaceTriangle.a.y} L ${hingePattern.pattern.partnerBackFaceTriangle.b.x} ${hingePattern.pattern.partnerBackFaceTriangle.b.y} L ${hingePattern.pattern.partnerBackFaceTriangle.c.x} ${hingePattern.pattern.partnerBackFaceTriangle.c.y} Z`}
			stroke="red"
			fill="none"
			stroke-width="1"
		/>
	{/if}
	{#if hingePattern.pattern.backfFaceTriangle}
		<path
			d={`M ${hingePattern.pattern.backfFaceTriangle.a.x} ${hingePattern.pattern.backfFaceTriangle.a.y} L ${hingePattern.pattern.backfFaceTriangle.b.x} ${hingePattern.pattern.backfFaceTriangle.b.y} L ${hingePattern.pattern.backfFaceTriangle.c.x} ${hingePattern.pattern.backfFaceTriangle.c.y} Z`}
			stroke="blue"
			fill="none"
			stroke-width="1"
		/>
	{/if}
	<!-- {#if panel.meta.backFaceTriangle}
		<path
			d={`M ${panel.meta.backFaceTriangle.a.x} ${panel.meta.backFaceTriangle.a.y} L ${panel.meta.backFaceTriangle.b.x} ${panel.meta.backFaceTriangle.b.y} L ${panel.meta.backFaceTriangle.c.x} ${panel.meta.backFaceTriangle.c.y} Z`}
			stroke="black"
			fill="none"
			stroke-width="2"
		/>
	{/if} -->
{/if}

{#if hingePattern.pattern.hinge}
	<path
		d={`M ${hingePattern.pattern.hinge[0].x} ${hingePattern.pattern.hinge[0].y} L ${hingePattern.pattern.hinge[1].x} ${hingePattern.pattern.hinge[1].y}`}
		stroke="rgba(0, 69, 200, .3)"
		stroke-width="2"
		fill="none"
	/>
{/if}
<SvgText
	string={printProjectionAddress(hingePattern.address, { hideProjection: true, hideTube: true })}
	anchor={{
		x:
			hingePattern.pattern.hinge[1].x -
			(hingePattern.pattern.hinge[1].x - hingePattern.pattern.hinge[0].x) / 2,
		y:
			hingePattern.pattern.hinge[1].y -
			(hingePattern.pattern.hinge[1].y - hingePattern.pattern.hinge[0].y) / 2
	}}
	offset={{ x: 'center', y: 'center' }}
	size={3}
	color="black"
/>
{#each hingePattern.pattern.holes as hole}
	<circle
		cx={hole.location.x}
		cy={hole.location.y}
		r={hole.holeDiameter / 2}
		fill="none"
		stroke="black"
		stroke-width="0.2"
	/>
	<path
		d={getHexPath(hole.location.x, hole.location.y, hole.nutDiameter / 2)}
		fill="none"
		stroke="black"
		stroke-width="0.2"
	/>
{/each}
