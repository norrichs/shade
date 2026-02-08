<script lang="ts">
	import { patterns } from '$lib/patterns';
	import { transformPatternByQuad } from '$lib/patterns/quadrilateral';
	import { scalePS, svgPathStringFromSegments } from '$lib/patterns/utils';
	import type {
		BandPatternGenerator,
		DynamicPath,
		Quadrilateral,
		TilingBasis,
		UnitPatternGenerator
	} from '$lib/types';
	import { Vector3 } from 'three';

	let {
		patternType,
		tilingBasis,
		width = 100,
		height = 100,
		rows = 1,
		columns = 1,
		active = false,
		strokeWidth = 2
	}: {
		patternType: string;
		tilingBasis: TilingBasis;
		width?: number;
		height?: number;
		rows?: number;
		columns?: number;
		active?: boolean;
		strokeWidth?: number;
	} = $props();

	const getPath = (
		patternType: string,
		rows: number,
		columns: number,
		width: number,
		height: number
	) => {
		let path = '';
		if (patterns[patternType]) {
			if (tilingBasis === 'quadrilateral') {
				const { getPattern } = patterns[patternType] as unknown as UnitPatternGenerator;
				const unitPattern = getPattern(rows, columns);
				const quad: Quadrilateral = {
					a: new Vector3(0, 0, 0),
					b: new Vector3(width, 0, 0),
					c: new Vector3(width, height, 0),
					d: new Vector3(0, height, 0)
				};
				path = svgPathStringFromSegments(transformPatternByQuad(unitPattern, quad));
				// path = svgPathStringFromSegments(scalePS(unitPattern, Math.max(width, height)));
			} else if (tilingBasis === 'triangle') {
				const { getPattern } = patterns[patternType] as unknown as UnitPatternGenerator;
				const unitPattern = getPattern(rows, columns);
				const quad: Quadrilateral = {
					a: new Vector3(0, 0, 0),
					b: new Vector3(width, 0, 0),
					c: new Vector3(width, height, 0),
					d: new Vector3(0, height, 0)
				};
				path = svgPathStringFromSegments(transformPatternByQuad(unitPattern, quad));
				// path = svgPathStringFromSegments(scalePS(unitPattern, Math.max(width, height)));
			} else if (tilingBasis === 'band') {
				const { getPattern } = patterns[patternType] as unknown as BandPatternGenerator;
				const quadBand: Quadrilateral[] = [
					{
						a: new Vector3(0.4, 0, 0),
						d: new Vector3(0.3, 0.2, 0),
						c: new Vector3(0.7, 0.2, 0),
						b: new Vector3(0.6, 0, 0)
					},
					{
						a: new Vector3(0.3, 0.2, 0),
						d: new Vector3(0.25, 0.4, 0),
						c: new Vector3(0.75, 0.4, 0),
						b: new Vector3(0.7, 0.2, 0)
					},
					{
						a: new Vector3(0.25, 0.4, 0),
						d: new Vector3(0.25, 0.6, 0),
						c: new Vector3(0.75, 0.6, 0),
						b: new Vector3(0.75, 0.4, 0)
					},
					{
						a: new Vector3(0.25, 0.6, 0),
						d: new Vector3(0.3, 0.8, 0),
						c: new Vector3(0.7, 0.8, 0),
						b: new Vector3(0.75, 0.6, 0)
					},
					{
						a: new Vector3(0.3, 0.8, 0),
						d: new Vector3(0.4, 1, 0),
						c: new Vector3(0.6, 1, 0),
						b: new Vector3(0.7, 0.8, 0)
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

	let tilePath = $derived(getPath(patternType, rows, columns, width, height));
</script>

<div class:active>
	<svg {width} {height} viewBox={`0 0 ${width} ${height}`}>
		<path
			d={tilePath}
			fill="none"
			stroke="black"
			stroke-width={strokeWidth}
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
