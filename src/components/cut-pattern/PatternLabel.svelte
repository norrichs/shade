<script lang="ts">
	import { getPathSize, rotatePS, scalePS, svgPathStringFromSegments, translatePS } from '$lib/patterns/utils';
	import type { PathSegment } from '$lib/types';
	import type { Point } from 'bezier-js';
	import { get } from 'svelte/store';
	import { numberPathSegments } from './number-path-segments';

	export let color: string;
	export let value: number;
	export let radius = 0;
	export let scale: number = 1;
	export let angle = 0;
	export let anchor: Point = { x: 0, y: 0 };

	const getLabelPathSegments = ({ value, r }: { value: number; r: number }) => {
		const labelTextPathSegments = `${value}`
			.split('')
			.map((digit, i) => {
				return translatePS(numberPathSegments[Number.parseInt(digit, 10)], 60 * i, 0);
			})
			.flat(1);

		const { width, height } = getPathSize(labelTextPathSegments);
		const padding = 20;

		const stemWidth = 20;
		const stemLength = 50;

		const halfWidth = (width + padding * 2) / 2;
		const labelOutlinePathSegments: PathSegment[] = [
			['M', 0, 0],
			['L', stemWidth / 2, 0],
			['L', stemWidth / 2, stemLength],
			['L', halfWidth - r, stemLength],
			['Q', halfWidth, stemLength, halfWidth, r + stemLength],
			['L', halfWidth, stemLength + 100 - r],
			['Q', halfWidth, 100 + stemLength, halfWidth - r, 100 + stemLength],
			['L', r - halfWidth, 100 + stemLength],
			['Q', -halfWidth, 100 + stemLength, -halfWidth, 100 - r + stemLength],
			['L', -halfWidth, r + stemLength],
			['Q', -halfWidth, stemLength, r - halfWidth, stemLength],
			['L', -stemWidth / 2, stemLength],
			['L', -stemWidth / 2, stemLength],
			['L', -stemWidth / 2, 0],
			['Z']
		];

		return [
			...labelOutlinePathSegments,
			...translatePS(labelTextPathSegments, 20 - halfWidth, 15 + stemLength)
		];
	};

	const adjust = (segments: PathSegment[]) => {
		let adjusted = segments;
		adjusted = translatePS(adjusted, anchor.x, anchor.y);
		adjusted = rotatePS(adjusted, angle, anchor);
		adjusted = scalePS(adjusted, -scale, anchor);
		return adjusted;
	};

	$: path = svgPathStringFromSegments(adjust(getLabelPathSegments({ value, r: radius })));
</script>

<!-- <g transform={`translate(${anchor.x}, ${anchor.y}) rotate(${angle}) scale(${-scale}, ${-scale})`}> -->
<path d={path} fill-rule="evenodd" fill={color} stroke="none" />
<!-- </g> -->
