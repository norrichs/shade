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
	export let labelOffset = -2;
	export let edgeLabelAnchor: 'start' | 'end' | 'center' = 'center';

	let { a, b, c } = panel.triangle;
	let center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
	let addressString = printProjectionAddress(panel.address);

	let panelFill = 'black';

	const handleClick = () => {
		$selectedProjection = panel.address;
	};

	const getAnchor = (v0: Vector3, v1: Vector3, style: 'start' | 'end' | 'center') => {
		switch (style) {
			case 'start':
				return v0.clone();
			case 'end':
				return v1.clone();
			case 'center':
			default:
				return new Vector3(v0.x + (v1.x - v0.x) / 2, v0.y + (v1.y - v0.y) / 2, 0);
		}
	};

	let anchorAB = getAnchor(a, b, edgeLabelAnchor);
	let anchorBC = getAnchor(b, c, edgeLabelAnchor);
	let anchorAC = getAnchor(c, a, edgeLabelAnchor);

	let labelABWidth = 0;
	let labelBCWidth = 0;
	let labelACWidth = 0;

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
		patternStyle: 'cut' | 'view',
		edgeLabelAnchor: 'start' | 'end' | 'center'
	) => {
		styles = patternStyles[patternStyle];
		a = p.triangle.a;
		b = p.triangle.b;
		c = p.triangle.c;
		anchorAB = getAnchor(a, b, edgeLabelAnchor);
		anchorBC = getAnchor(b, c, edgeLabelAnchor);
		anchorAC = getAnchor(c, a, edgeLabelAnchor);
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

		const labelAB = document.querySelector(`#label-${addressString}_ab`);
		const labelBC = document.querySelector(`#label-${addressString}_bc`);
		const labelAC = document.querySelector(`#label-${addressString}_ac`);
		labelABWidth = (labelAB as SVGTextElement)?.getBBox().width;
		labelBCWidth = (labelBC as SVGTextElement)?.getBBox().width;
		labelACWidth = (labelAC as SVGTextElement)?.getBBox().width;

		console.debug({ labelAB, labelABWidth });
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

	const edgeLength = (edge: TriangleEdge) => {
		const [p0, p1] = getTrianglePointFromTriangleEdge(edge, 'edge-order');
		const dx = Math.abs(panel.triangle[p1].x - panel.triangle[p0].x);
		const dy = Math.abs(panel.triangle[p1].y - panel.triangle[p0].y);
		return Math.sqrt(dx * dx + dy * dy);
	};

	const edgeSegment = (t: Triangle, edge: TriangleEdge) => {
		const [p0, p1] = getTrianglePointFromTriangleEdge(edge, 'triangle-order');
		const { x: x0, y: y0 } = t[p0];
		const { x: x1, y: y1 } = t[p1];
		return `M ${x0} ${y0} L ${x1} ${y1}`;
	};

	$: update(panel, $selectedProjectionGeometry, patternStyle, edgeLabelAnchor);
</script>

<g id={`panel-${addressString}`} class="relief-font" font-size={labelSize} {...styles}>
	<style>
		@font-face {
			font-family: 'Relief SingleLine OTF-SVG';
			src: url('/fonts/ReliefSingleLineOTF-SVG-Regular.otf') format('truetype');
			font-weight: normal;
			font-style: normal;
		}
	</style>

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
		fill="none"
		stroke="black"
		stroke-width={0.2}
		fill-opacity="1"
		font-family="Relief SingleLine OTF-SVG"
	>
		<text x={center.x - labelSize * 2} y={center.y}>{addressString}</text>
		<g transform={`translate(${anchorAB.x}, ${anchorAB.y}) rotate(${getAngle('ab')})`}>
			<text
				id={`label-${addressString}_ab`}
				transform={`translate(-${labelABWidth / 2 + 3}, ${labelOffset})`}
			>
				{panelEdgeLabel('ab')}
			</text>
		</g>
		<g transform={`translate(${anchorBC.x}, ${anchorBC.y}) rotate(${getAngle('bc')})`}>
			<text
				id={`label-${addressString}_bc`}
				transform={`translate(-${labelBCWidth / 2 + 3}, ${labelOffset})`}
			>
				{panelEdgeLabel('bc')}
			</text>
		</g>
		<g transform={`translate(${anchorAC.x}, ${anchorAC.y}) rotate(${getAngle('ac')})`}>
			<text
				id={`label-${addressString}_ac`}
				transform={`translate(-${labelACWidth / 2 + 3}, ${labelOffset})`}
			>
				{panelEdgeLabel('ac')}
			</text>
		</g>
	</g>
</g>
