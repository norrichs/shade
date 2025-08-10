<script lang="ts">
	import {
		corrected,
		getPanelEdgeMeta,
		getTrianglePointFromTriangleEdge
	} from '$lib/cut-pattern/generate-pattern';
	import { getLength, svgPathStringFromSegments } from '$lib/patterns/utils';
	import { printProjectionAddress } from '$lib/projection-geometry/generate-projection';
	import type { ProjectionAddress_Facet, TriangleEdge } from '$lib/projection-geometry/types';
	import type { PanelPattern, TrianglePoint } from '$lib/types';
	import { Vector3, type Triangle } from 'three';
	import PatternLabel from './PatternLabel.svelte';
	import {
		addressIsInArray,
		selectedProjection,
		selectedProjectionGeometry,
		superGlobuleStore
	} from '$lib/stores';
	import { formatAngle } from '$lib/util';

	export let panel: PanelPattern;
	export let showCrease = true;
	export let patternStyle: 'view' | 'cut';
	export let labelSize: number;
	export let labelOffset = 10;

	let { a, b, c } = panel.triangle;
	let center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
	let addressString = printProjectionAddress(panel.address);

	let panelFill = 'black';

	const handleClick = () => {
		$selectedProjection = panel.address;
	};

	const getPanelLabelAnchors = (t: Triangle) => {
		const triangleEdgeVectors = (['a', 'b', 'c'] as TrianglePoint[]).map((p0, i, points) => {
			const p1 = points[(i + 1) % 3];
			const vector = t[p1].clone().addScaledVector(t[p0], -1);
			const anchor = {
				edge: corrected(`${p0}${p1}`),
				vector,
				angle: vector.angleTo(new Vector3(0, 1, 0))
			};
			return anchor;
		});
		return triangleEdgeVectors;
	};

	let panelLabelAnchors = getPanelLabelAnchors(panel.triangle);

	const panelEdgeLabel = (edge: TriangleEdge) => {
		const m = panel.meta.edges[edge];
		return `${edge}: ${
			m.partner ? printProjectionAddress(m.partner, { hideProjection: true }) : ''
		} [${formatAngle(m.cutAngle || 0)}] ${m.label ? m.label : ''}`;
	};

	const getAngle = (edge: TriangleEdge) => {
		const baseAngle =
			((panelLabelAnchors.find((a) => a.edge === edge)?.angle || 0) * 180) / Math.PI;
		const map = { ac: ['c', 'a'], ab: ['a', 'b'], bc: ['b', 'c'] };
		const [p0, p1] = map[edge];
		const v0 = panel.triangle[p0 as TrianglePoint];
		const v1 = panel.triangle[p1 as TrianglePoint];
		if (v0.x < v1.x) return 90 - baseAngle;
		return 90 + baseAngle;
	};

	const update = (
		p: PanelPattern,
		sPG: typeof $selectedProjectionGeometry,
		patternStyle: 'cut' | 'view'
	) => {
		styles = patternStyles[patternStyle];
		a = p.triangle.a;
		b = p.triangle.b;
		c = p.triangle.c;
		center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
		addressString = printProjectionAddress(panel.address, { hideProjection: true });

		if (sPG) {
			if (addressIsInArray(panel.address, sPG.selected)) {
				panelFill = 'red';
			} else if (addressIsInArray(panel.address, sPG.selectedPartners)) {
				panelFill = 'blue';
			} else {
				panelFill = 'black';
			}
		}
	};
	const edges = ['ab', 'bc', 'ac'] as TriangleEdge[];

	const valleyDash = '6 3';
	const mountainDash = '6 3 2 3';

	const patternStyles = {
		cut: {
			fill: 'none',
			textFill: 'none',
			textStroke: 'black',
			stroke: 'black',
			'stroke-width': 0.2
		},
		view: {
			fill: 'black',
			textFill: 'black',
			textStroke: 'none',
			stroke: 'black',
			'fill-opacity': 0.1,
			'stroke-width': 1
		}
	};

	let styles = patternStyles[patternStyle];

	const edgeSegment = (t: Triangle, edge: TriangleEdge) => {
		const [p0, p1] = getTrianglePointFromTriangleEdge(edge, 'triangle-order');
		const { x: x0, y: y0 } = t[p0];
		const { x: x1, y: y1 } = t[p1];
		return `M ${x0} ${y0} L ${x1} ${y1}`;
	};

	$: update(panel, $selectedProjectionGeometry, patternStyle);
</script>

<g id={`panel-${addressString}`} font-family="courier" font-size={labelSize} {...styles}>
	{#if patternStyle === 'view'}
		<path d={panel.svgPath} fill={panelFill} stroke="none" on:click={handleClick} />
	{/if}

	{#if showCrease}
		{#each edges as edge}
			<path
				d={edgeSegment(panel.triangle, edge)}
				class="crease"
				stroke-dasharray={panel.meta.edges[edge].crease === 'mountain' ? mountainDash : valleyDash}
			/>
		{/each}
	{/if}

	<g
		fill={styles.textFill}
		stroke={styles.textStroke}
		stroke-width={styles['stroke-width']}
		fill-opacity="1"
	>
		<text x={center.x - labelSize * 2} y={center.y}>{addressString}</text>
		<g transform={`translate(${a.x}, ${a.y}) rotate(${getAngle('ab')})`}>
			<text transform={`translate(0, ${labelOffset})`}>
				{panelEdgeLabel('ab')}
			</text>
		</g>
		<g transform={`translate(${b.x}, ${b.y}) rotate(${getAngle('bc')})`}>
			<text transform={`translate(0, ${labelOffset})`}>
				{panelEdgeLabel('bc')}
			</text>
		</g>
		<g transform={`translate(${c.x}, ${c.y}) rotate(${getAngle('ac')})`}>
			<text transform={`translate(0, ${labelOffset})`}>
				{panelEdgeLabel('ac')}
			</text>
		</g>
	</g>
</g>
