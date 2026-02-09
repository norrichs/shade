<script lang="ts">
	import type { BandCutPattern, Point } from '$lib/types';
	import type { Snippet } from 'svelte';
	import PatternLabel from './PatternLabel.svelte';
	import { patternConfigStore, selectedProjection } from '$lib/stores';
	import type { Vector3 } from 'three';
	import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
	import { concatAddress } from '$lib/util';

	let {
		band,
		index,
		origin,
		showLabel = false,
		showBounds = false,
		portal = false,
		tagAnchorPoint,
		tagAngle,
		children
	}: {
		band: BandCutPattern;
		index: number;
		origin: Vector3;
		showLabel?: boolean;
		showBounds?: boolean;
		portal?: boolean;
		tagAnchorPoint: Point;
		tagAngle: number | undefined;
		children?: Snippet;
	} = $props();

	let colors = {
		default: 'orange',
		hovered: 'blue',
		focused: 'rebeccapurple'
	};

	let isFocused = $state(false);
	let isHovered = $state(false);
	let color = $derived(isHovered ? colors.hovered : isFocused ? colors.focused : colors.default);

	const handleMouseOver = (address: GlobuleAddress_Band) => {
		isHovered = true;
	};
	const handleMouseOut = (address: GlobuleAddress_Band) => {
		isHovered = false;
	};

	const handleClick = (address: GlobuleAddress_Band) => {
		console.debug('handleClick', address);
		$selectedProjection = { ...address, facet: 0 };
	};
</script>

<g
	transform={`translate(${origin.x} ${origin.y})`}
	id={`band-${band.id}`}
	role="group"
	onmouseover={() => handleMouseOver(band.address)}
	onmouseout={() => handleMouseOut(band.address)}
	onfocus={() => {
		console.debug('onFocus');
		handleClick(band.address);
		isFocused = true;
	}}
	onblur={() => (isFocused = false)}
	stroke={color}
>
	{#if showBounds && band.bounds}<rect
			x={band.bounds.left}
			y={band.bounds.top}
			width={band.bounds.width}
			height={band.bounds.height}
			fill="rgba(0, 0, 0, 0.05)"
			stroke="red"
			stroke-width={0.1}
		/>{/if}
	{@render children?.()}
	{#if showLabel}
		<PatternLabel
			id={`band-${band.id}`}
			{color}
			value={index}
			radius={20}
			scale={$patternConfigStore.tiledPatternConfig.labels?.scale || 0.1}
			angle={$patternConfigStore.tiledPatternConfig.labels?.angle ?? band.tagAngle ?? 0}
			anchor={tagAnchorPoint || { x: -50, y: -50 }}
			addressStrings={[
				concatAddress(band.address, 'tb'),
				...(band.meta?.startPartnerBand
					? [` > ${concatAddress(band.meta?.startPartnerBand, 'tb')}`]
					: []),
				...(band.meta?.endPartnerBand
					? [` > ${concatAddress(band.meta?.endPartnerBand, 'tb')}`]
					: [])
			]}
			portal={portal ? { transform: `translate(${origin.x} ${origin.y})` } : undefined}
		/>
	{/if}
</g>
