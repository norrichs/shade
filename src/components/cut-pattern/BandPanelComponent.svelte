<script lang="ts">
	import type { BandPanelPattern } from '$lib/types';
	import { printProjectionAddress } from '$lib/projection-geometry/generate-projection';
	import { Vector3 } from 'three';
	export let band: BandPanelPattern;
	export let index: number;
	export let correctAngle = true;

	let colors = {
		default: 'orange',
		hovered: 'blue',
		focused: 'rebeccapurple'
	};

	const getCorrectedAngle = (band: BandPanelPattern) => {
		if (!correctAngle) return 0;
		const [firstPanelCenter, lastPanelCenter] = [new Vector3(), new Vector3()];
		band.panels[0].triangle.getMidpoint(firstPanelCenter);
		band.panels[band.panels.length - 1].triangle.getMidpoint(lastPanelCenter);
		const vector = lastPanelCenter.clone().addScaledVector(firstPanelCenter, -1);
		const angle = vector.angleTo(new Vector3(0, 1, 0));
		const direction = firstPanelCenter.x < lastPanelCenter.x ? 1 : -1;
		return (direction * (angle * 180)) / Math.PI;
	};

	$: angle = getCorrectedAngle(band);

	let color = colors.default;
	let isFocused = false;
	let isHovered = false;
</script>

<g
	transform={`translate(${-250 + 360 * index} -50) scale(1,1) rotate(${angle})`}
	id={printProjectionAddress(band.address)}
	role="group"
	stroke={color}
>
	<slot />
	<!-- {#if showLabel}
		<PatternLabel
			{color}
			value={index}
			radius={5}
			scale={$patternConfigStore.tiledPatternConfig.labels?.scale || 0.1}
			angle={$patternConfigStore.tiledPatternConfig.labels?.angle || band.tagAngle}
			anchor={band.tagAnchorPoint || { x: -50, y: -50 }}
		/>
	{/if} -->
</g>
