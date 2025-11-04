<script lang="ts">
	import type { BandAddressed, GeometryAddress, BandCutPattern, Point } from '$lib/types';
	import PatternLabel from './PatternLabel.svelte';
	import {
		concatAddress,
		concatAddress_Band,
		patternConfigStore,
		selectedBand,
		superGlobuleStore
	} from '$lib/stores';
	import type { Vector3 } from 'three';

	export let band: BandCutPattern;
	export let index: number;
	export let origin: Vector3;
	export let showLabel = true;
	export let showBounds = true;
	export let tagAnchorPoint: Point;
	export let tagAngle: number | undefined;
	let colors = {
		default: 'orange',
		hovered: 'blue',
		focused: 'rebeccapurple'
	};

	console.debug('BandComponent', {
		band,
		globuleBand: $superGlobuleStore.projections[0].tubes[band.address.tube].bands[band.address.band]
	});

	let color = colors.default;
	let isFocused = false;
	let isHovered = false;

	const update = (isHovered: boolean, isFocused: boolean) => {
		if (isHovered) {
			color = colors.hovered;
		} else {
			color = isFocused ? colors.focused : colors.default;
		}
	};

	const handleMouseOver = (address: GeometryAddress<BandAddressed>) => {
		isHovered = true;
		// $selectedBand = { ...address, g: [...address.g] };
	};
	const handleMouseOut = (address: GeometryAddress<BandAddressed>) => {
		isHovered = false;
		// $selectedBand = { ...address, g: [...address.g] };
	};

	const handleClick = (address: GeometryAddress<BandAddressed>) => {
		// $selectedBand = { ...address, g: [...address.g] };
	};

	$: update(isHovered, isFocused);
</script>

<g
	transform={`translate(${origin.x} ${origin.y})`}
	id={`band-${band.id}`}
	role="group"
	on:mouseover={() => handleMouseOver(band.address)}
	on:mouseout={() => handleMouseOut(band.address)}
	on:focus={() => {
		handleClick(band.address);
		isFocused = true;
	}}
	on:blur={() => (isFocused = false)}
	stroke={color}
>
	{#if showBounds}<rect
			x={band.bounds.left}
			y={band.bounds.top}
			width={band.bounds.width}
			height={band.bounds.height}
			fill="rgba(0, 0, 0, 0.05)"
			stroke="red"
			stroke-width={0.1}
		/>{/if}
	<slot />
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
				concatAddress_Band(band.address, 'tb'),
				...(band.meta?.startPartnerBand
					? [` > ${concatAddress(band.meta?.startPartnerBand, 'tb')}`]
					: []),
				...(band.meta?.endPartnerBand
					? [` > ${concatAddress(band.meta?.endPartnerBand, 'tb')}`]
					: [])
			]}
			portal={{target: 'label-text-container', transform: `translate(${origin.x} ${origin.y})`}}
		/>
	{/if}
</g>
