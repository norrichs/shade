<script lang="ts">
	import type { PatternScale, Point } from '$lib/types';

	let { scale, origin = { x: 100, y: 100 } }: { scale: PatternScale; origin?: Point } = $props();

	const getScaleBarPath = ({ unit, unitPerSvgUnit, quantity }: PatternScale) => {
		const unitConversionFactor = unit === 'in' ? 25.4 : 1;
		const height = (1 / unitPerSvgUnit) * quantity * unitConversionFactor;
		return `M 0 0 l 20 0 m -20 0 l 0 ${height} l 20 0`;
	};

	let scaleBarPath = $derived(getScaleBarPath(scale));
</script>

<g fill="none" stroke="black" stroke-width="1">
	<text
		transform={`rotate(-90) translate(${(-1 / scale.unitPerSvgUnit) * scale.quantity}, -10)`}
		x={0}
		y={0}
		>{`${scale.quantity} ${scale.unit} ${
			scale.secondary ? ` / ${scale.secondary.quantity} ${scale.secondary.unit}` : ''
		}`}</text
	>
	<path d={scaleBarPath} />
</g>
