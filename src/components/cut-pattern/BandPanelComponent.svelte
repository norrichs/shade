<script lang="ts">
	import type { BandPanelPattern } from '$lib/types';
	import { printProjectionAddress } from '$lib/projection-geometry/generate-projection';
	import { Vector3 } from 'three';
	import { getBandSlopeVector, getMinimalBoundingBoxAndRotationAngle } from './distrubute-panels';
	import { radToDeg } from '$lib/patterns/utils';
	import { CgEnter } from 'svelte-icons-pack/cg';

	export let band: BandPanelPattern;
	export let index: number;
	export let offsetX: number
	export let offsetY: number
	export let correctAngle = true;
	export let showBounds = false;

	let colors = {
		default: 'orange',
		hovered: 'blue',
		focused: 'rebeccapurple'
	};

	const localbounds = getMinimalBoundingBoxAndRotationAngle(band);

	let color = colors.default;
	let isFocused = false;
	let isHovered = false;
</script>


<g
	transform={`translate(${offsetX} ${offsetY}) scale(1,1) rotate(0)`}
	id={printProjectionAddress(band.address)}
	role="group"
	stroke={color}
>
	{#if band.bounds && showBounds}
		<rect x={band.bounds.left} y={band.bounds.top} width={band.bounds.width} height={band.bounds.height} fill="rgba(0, 0, 0, 0.05)" stroke="red" stroke-width={.1} />
	{/if}
	<slot />
</g>

