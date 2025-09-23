<script lang="ts">
	import {
		corrected,
		getPanelEdgeMeta,
		getTrianglePointFromTriangleEdge,
		type PanelHoleConfig
	} from '$lib/cut-pattern/generate-pattern';
	import { getLength, svgPathStringFromSegments } from '$lib/patterns/utils';
	import { printProjectionAddress } from '$lib/projection-geometry/generate-projection';
	import type { ProjectionAddress_Facet, TriangleEdge } from '$lib/projection-geometry/types';
	import type { PanelPattern, PathSegment, TrianglePoint } from '$lib/types';
	import { Vector3, type Triangle } from 'three';
	import PatternLabel from './PatternLabel.svelte';

	import {
		superGlobulePatternStore,
		addressIsInArray,
		selectedProjection,
		selectedProjectionGeometry,
		superGlobuleStore,
		isSuperGlobuleProjectionPanelPattern
	} from '$lib/stores';
	import { formatAngle } from '$lib/util';
	import SvgText from './SvgText/SvgText.svelte';
	import RegistrationMark from './RegistrationMark.svelte';

	export let panel: PanelPattern;
	export let showCrease = true;
	export let patternStyle: 'view' | 'cut';
	export let labelSize: number;
	export let labelStyle: 'svgLabels' | 'textLabels' = 'textLabels';
	export let edgeLabelAnchor: 'start' | 'end' | 'center' = 'center';
	export let verbose = false;
	export let showErrors = false;

	let { a, b, c } = panel.triangle;
	let center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
	let addressString = printProjectionAddress(panel.address, {
		hideProjection: true,
		hideTube: true
	});
	const trianglePoints = ['a', 'b', 'c'] as TrianglePoint[];
	const triangleEdges = ['ab', 'bc', 'ac'] as TriangleEdge[];
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

	const anchors = {
		ab: getAnchor(a, b, edgeLabelAnchor),
		bc: getAnchor(b, c, edgeLabelAnchor),
		ac: getAnchor(c, a, edgeLabelAnchor)
	};
	const labelWidth = {
		ab: 0,
		bc: 0,
		ac: 0
	};

	const getPairAddresses = (edge: TriangleEdge) => {
		const thisEdgeStr = printProjectionAddress({ ...panel.address, edge });
		if (!isSuperGlobuleProjectionPanelPattern($superGlobulePatternStore.projectionPattern))
			return false;
		const { tubes } = $superGlobulePatternStore.projectionPattern.projectionPanelPattern;
		const partnerAddress = panel.meta.edges[corrected(edge)].partner;
		const partner =
			tubes[partnerAddress.tube].bands[partnerAddress.band].panels[partnerAddress.facet];
		const reflectedAddress = partner.meta.edges[corrected(partnerAddress.edge)].partner;
		const reflectedEdgeStr = printProjectionAddress(reflectedAddress);
		return { thisEdgeStr, reflectedEdgeStr };
	};

	const isMatched = (edge: TriangleEdge) => {
		const { thisEdgeStr, reflectedEdgeStr } = getPairAddresses(edge);
		if (!isSuperGlobuleProjectionPanelPattern($superGlobulePatternStore.projectionPattern))
			return '';
		const { tubes } = $superGlobulePatternStore.projectionPattern.projectionPanelPattern;
		const partnerAddress = panel.meta.edges[corrected(edge)].partner;
		const partner =
			tubes[partnerAddress.tube].bands[partnerAddress.band].panels[partnerAddress.facet];
		return (
			thisEdgeStr === reflectedEdgeStr &&
			Math.abs(
				panel.meta.edges[edge].cutAngle -
					partner.meta.edges[corrected(partnerAddress.edge)].cutAngle
			) <
				1 / 100000
		);
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

	const verboseLabel = (edge: TriangleEdge) => {
		if (!isSuperGlobuleProjectionPanelPattern($superGlobulePatternStore.projectionPattern))
			return '';
		const { tubes } = $superGlobulePatternStore.projectionPattern.projectionPanelPattern;
		const partnerAddress = panel.meta.edges[corrected(edge)].partner;
		const partner =
			tubes[partnerAddress.tube].bands[partnerAddress.band].panels[partnerAddress.facet];
		const reflectedAddress = partner.meta.edges[corrected(partnerAddress.edge)].partner;
		if (!isMatched(edge)) {
			const { thisEdgeStr, reflectedEdgeStr } = getPairAddresses(edge);
			return `${thisEdgeStr} <- ${reflectedEdgeStr}`;
		}
		return `-> ${printProjectionAddress(reflectedAddress, { hideProjection: true })}`;
	};

	const panelEdgeLabel = (edge: TriangleEdge) => {
		const m = panel.meta.edges[edge];
		return `${edge}: ${
			m.partner ? printProjectionAddress(m.partner, { hideProjection: true, hideTube: true }) : ''
		} [${formatAngle(m.cutAngle || 0)}] ${m.label ? m.label : ''}${
			verbose ? verboseLabel(edge) : ''
		}`;
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
		anchors.ab = getAnchor(a, b, edgeLabelAnchor);
		anchors.bc = getAnchor(b, c, edgeLabelAnchor);
		anchors.ac = getAnchor(c, a, edgeLabelAnchor);
		center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
		addressString = printProjectionAddress(panel.address, { hideProjection: true, hideTube: true });

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
		labelWidth.ab = (labelAB as SVGTextElement)?.getBBox().width || 0;
		labelWidth.bc = (labelBC as SVGTextElement)?.getBBox().width || 0;
		labelWidth.ac = (labelAC as SVGTextElement)?.getBBox().width || 0;

		edgeMatches = { ab: isMatched('ab'), bc: isMatched('bc'), ac: isMatched('ac') };
	};

	let edgeMatches = { ab: isMatched('ab'), bc: isMatched('bc'), ac: isMatched('ac') };
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

	const svgPathFromTriangle = (t: Triangle) => {
		const path = [
			['M', t.a.x, t.a.y],
			['L', t.b.x, t.b.y],
			['L', t.c.x, t.c.y],
			['Z']
		] as PathSegment[];
		return svgPathStringFromSegments(path);
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
		<path
			d={svgPathFromTriangle(panel.triangle)}
			fill={panelFill}
			stroke="none"
			on:click={handleClick}
		/>
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
		<SvgText
			id={`svg-text-Test`}
			string={addressString}
			angle={0}
			size={labelSize * 2}
			anchor={{ x: center.x, y: center.y }}
			offset={{ x: 'center', y: 'center' }}
		/>

		{#each triangleEdges as edge}
			<SvgText
				id={`label-${addressString}_${edge}`}
				string={panelEdgeLabel(edge)}
				angle={getAngle(edge)}
				size={labelSize}
				anchor={{ x: anchors[edge].x, y: anchors[edge].y }}
				offset={{ x: 'center', y: -2.5 }}
			/>
		{/each}
		{#if verbose}
			<!-- {#each edges as edge}
				{#if panel.meta.backFaceRegistrationPoints}
					<circle
						cx={panel.meta.backFaceRegistrationPoints[edge].x}
						cy={panel.meta.backFaceRegistrationPoints[edge].y}
						r={2	}
						fill="blue"
					/>
				{/if}
				{#if panel.meta.frontFaceRegistrationPoints}
					<circle
						cx={panel.meta.frontFaceRegistrationPoints[edge].x}
						cy={panel.meta.frontFaceRegistrationPoints[edge].y}
						r={2}
						fill="red"
					/>
				{/if}
			{/each} -->

			{#each edges as edge}
				<RegistrationMark {edge} triangle={panel.triangle} style="tick" length={2.5} />
			{/each}
		{/if}
		{#each edges as edge}
			{#each panel.meta.edges[edge].holes || [] as hole}
				{#if patternStyle === 'cut'}
					<circle cx={hole.location.x} cy={hole.location.y} r={hole.holeDiameter / 2} fill="none" />
					<path
						d={`M ${hole.location.x} ${hole.location.y - hole.holeDiameter / 2} v ${
							hole.holeDiameter
						} M ${hole.location.x - hole.holeDiameter / 2} ${hole.location.y} h ${
							hole.holeDiameter
						}`}
						stroke="black"
						fill="none"
					/>
				{:else}
					<circle cx={hole.location.x} cy={hole.location.y} r={hole.holeDiameter / 2} fill="none" />
					<circle cx={hole.location.x} cy={hole.location.y} r={hole.headDiameter / 2} fill="none" />
					<path
						d={`M ${hole.location.x} ${hole.location.y - hole.headDiameter / 2} v ${
							hole.headDiameter
						} M ${hole.location.x - hole.headDiameter / 2} ${hole.location.y} h ${
							hole.headDiameter
						}`}
						stroke="black"
						fill="none"
					/>
				{/if}
			{/each}
		{/each}
		{#if patternStyle === 'view'}
			{#if showErrors}
				{#each edges as edge}
					<path
						d={edgeSegment(panel.triangle, edge)}
						stroke-width={6}
						stroke-opacity={0.2}
						stroke={edgeMatches[edge] ? 'green' : 'red'}
						stroke-linecap="round"
					/>
				{/each}
			{/if}
			{#if panel.meta.insetTriangle}
				<path
					d={svgPathFromTriangle(panel.meta.insetTriangle)}
					stroke-width={0.5}
					stroke-opacity={1}
					stroke="black"
				/>
			{/if}
			{#if panel.meta.backFaceTriangle}
				<path
					d={svgPathFromTriangle(panel.meta.backFaceTriangle)}
					stroke-width={0.5}
					stroke-opacity={1}
					stroke="red"
				/>
			{/if}
			{#if verbose}
				{#each trianglePoints as p}
					<circle
						cx={panel.triangle[p].x}
						cy={panel.triangle[p].y}
						r="3"
						fill="white"
						fill-opacity={1}
					/>
					<text
						transform="translate(-1,2)"
						x={panel.triangle[p].x}
						y={panel.triangle[p].y}
						fill="none"
						stroke-width="0.2">{p}</text
					>
				{/each}
			{/if}
		{/if}
	</g>
</g>
