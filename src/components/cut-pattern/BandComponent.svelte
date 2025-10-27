<script lang="ts">
	import type { BandAddressed, GeometryAddress, BandCutPattern } from '$lib/types';
	import PatternLabel from './PatternLabel.svelte';
	import { patternConfigStore, selectedBand } from '$lib/stores';

	export let band: BandCutPattern;
	export let index: number;
	export let origin: Vector3;
	export let showLabel = true;
	export let showBounds = true;
	let colors = {
		default: 'orange',
		hovered: 'blue',
		focused: 'rebeccapurple'
	};

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
	{#if showBounds}<rect x={band.bounds.left} y={band.bounds.top} width={band.bounds.width} height={band.bounds.height} fill="rgba(0, 0, 0, 0.05)" stroke="red" stroke-width={.1} />{/if}
	<slot />
	{#if showLabel}
		<PatternLabel
			{color}
			value={index}
			radius={5}
			scale={$patternConfigStore.tiledPatternConfig.labels?.scale || 0.1}
			angle={$patternConfigStore.tiledPatternConfig.labels?.angle || band.tagAngle}
			anchor={band.tagAnchorPoint || { x: -50, y: -50 }}
		/>
	{/if}
</g>
