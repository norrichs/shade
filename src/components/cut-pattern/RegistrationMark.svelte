<script lang="ts">
	import { getTrianglePointFromTriangleEdge } from '$lib/cut-pattern/generate-pattern';
	import { getMidPoint } from '$lib/patterns/utils';
	import type { TriangleEdge } from '$lib/projection-geometry/types';
	import { Vector3, type Triangle } from 'three';
	import { getEdgeVector } from './distrubute-panels';

	export let edge: TriangleEdge;
	export let triangle: Triangle;
	export let style: 'tick' | 'check' = 'tick';
	export let length: number = 5;

	const getMarkPath = (edge: TriangleEdge, triangle: Triangle, style: 'tick' | 'check') => {
		const [p0, p1] = getTrianglePointFromTriangleEdge(edge, 'triangle-order');
		const anchor = getMidPoint(triangle[p0], triangle[p1]);
		if (style === 'tick') {
			const extensionVector = getEdgeVector(triangle, [p0, p1])
				.setLength(length)
				.applyAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2);
			const extension = anchor.clone().addScaledVector(extensionVector, 1);
			return `M ${anchor.x} ${anchor.y} L ${extension.x} ${extension.y}`;
		}
	};

	$: markPath = getMarkPath(edge, triangle, style);
</script>

<path d={markPath} stroke="black" stroke-width={0.25} />
