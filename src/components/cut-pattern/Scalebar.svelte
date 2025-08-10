<script lang="ts">
	import type { PatternScale, Point } from '$lib/types';

	export let scale: PatternScale = { unit: 'inch', unitPerSvgUnit: 1 / 100, quantity: 1 };
	export let origin: Point = { x: 100, y: 100 };

	const getScaleBarPath = ({ unit, unitPerSvgUnit, quantity }: PatternScale) => {
		const height = (1 / unitPerSvgUnit) * quantity;
		return `M 0 0 l 20 0 m -20 0 l 0 ${height} l 20 0`;
	};

	$: scaleBarPath = getScaleBarPath(scale);
</script>

<g fill="none" stroke="black" stroke-width="1">
	<text
		transform={`rotate(-90) translate(${(-1 / scale.unitPerSvgUnit) * scale.quantity}, -10)`}
		x={0}
		y={0}>{`${scale.quantity} ${scale.unit}`}</text
	>
	<path d={scaleBarPath} />
</g>
