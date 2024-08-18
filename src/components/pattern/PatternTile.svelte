<script lang="ts">
	import { svgPathStringFromSegments } from '$lib/patterns/flower-of-life';
	import {
		patterns,
		type BandPatternGenerator,
		type DynamicPath,
		type DynamicPathCollection,
		type UnitPatternGenerator
	} from '$lib/patterns/patterns';
	import { scalePS } from '$lib/patterns/utils';
	import type { BandPattern, Quadrilateral, TilingBasis } from '$lib/types';

	export let patternType: string;
	export let tilingBasis: TilingBasis;
	export let width = 100;
	export let height = 100;
	export let rows: 1 | 2 | 3 = 1;
	export let columns: 1 | 2 | 3 | 4 | 5 = 1;
	export let active = false;

	const getPath = (patternType: string) => {
		let path = '';
		if (patterns[patternType]) {
			if (tilingBasis === 'quadrilateral') {
				const { getPattern } = patterns[patternType] as unknown as UnitPatternGenerator;
				const unitPattern = getPattern(rows, columns);
				path = svgPathStringFromSegments(scalePS(unitPattern, Math.max(width, height)));
			} else if (tilingBasis === 'band') {
				const { getPattern } = patterns[patternType] as unknown as BandPatternGenerator;
				const quadBand: Quadrilateral[] = [
					{
						p0: { x: 0.4, y: 0 },
						p3: { x: 0.3, y: 0.2 },
						p2: { x: 0.7, y: 0.2 },
						p1: { x: 0.6, y: 0 }
					},
					{
						p0: { x: 0.3, y: 0.2 },
						p3: { x: 0.25, y: 0.4 },
						p2: { x: 0.75, y: 0.4 },
						p1: { x: 0.7, y: 0.2 }
					},
					{
						p0: { x: 0.25, y: 0.4 },
						p3: { x: 0.25, y: 0.6 },
						p2: { x: 0.75, y: 0.6 },
						p1: { x: 0.75, y: 0.4 }
					},
					{
						p0: { x: 0.25, y: 0.6 },
						p3: { x: 0.3, y: 0.8 },
						p2: { x: 0.7, y: 0.8 },
						p1: { x: 0.75, y: 0.6 }
					},
					{
						p0: { x: 0.3, y: 0.8 },
						p3: { x: 0.4, y: 1 },
						p2: { x: 0.6, y: 1 },
						p1: { x: 0.7, y: 0.8 }
					}
				];
				const outlineShape: DynamicPath = getPattern(1, 1, quadBand).outlineShape;
				path = svgPathStringFromSegments(scalePS(outlineShape[0].path, Math.max(width, height)));
			}
		} else {
			path = svgPathStringFromSegments(
				scalePS(
					[
						['M', 0, 0],
						['L', 1, 1],
						['M', 0, 1],
						['L', 1, 0]
					],
					Math.max(width, height)
				)
			);
		}
		return path;
	};

	$: tilePath = getPath(patternType);
</script>

<div class:active>
	<svg {width} {height} viewBox={`0 0 ${width} ${height}`}>
		<path
			d={tilePath}
			fill="none"
			stroke="black"
			stroke-width="2"
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
	</svg>
</div>

<style>
	div {
		height: fit-content;
		padding: 8px;
		border-radius: 4px;
		border: 1px solid gray;
		background-color: whitesmoke;
	}
	div:hover {
		background-color: deepskyblue;
	}
	.active {
		background-color: deepskyblue;
	}
	svg {
		overflow: visible;
	}
</style>
