<script lang="ts">
	import type { BandAddressed, GeometryAddress, PatternedBand } from '$lib/types';
	import PatternLabel from './PatternLabel.svelte';
	import { patternConfigStore, selectedBand } from '$lib/stores';

	export let band: PatternedBand;
	export let index: number;
	export let showLabel = true;

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
		$selectedBand = { ...address, g: [...address.g] };
	};
	const handleMouseOut = (address: GeometryAddress<BandAddressed>) => {
		isHovered = false;
		// $selectedBand = { ...address, g: [...address.g] };
	};

	const handleClick = (address: GeometryAddress<BandAddressed>) => {
		$selectedBand = { ...address, g: [...address.g] };
	};
	$: update(isHovered, isFocused);
</script>

<g
	transform={`translate(${-250 + 50 * index} -50) scale(-1,-1)`}
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
