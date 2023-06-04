<script lang="ts">
	import { T } from '@threlte/core';
	import { Edges } from '@threlte/extras';
	import {
		DoubleSide,
		CurvePath,
		BufferGeometry,
		MeshNormalMaterial,
		EdgesGeometry,
		LineBasicMaterial,
		MeshToonMaterial,
		MeshPhysicalMaterial
	} from 'three';
	import type { Strut } from '$lib/generate-shape';

	export let strut: Strut;
	export let showTabs: boolean = false;

	$: bandPoints = strut.facets
		.map((facet) => [facet.triangle.a, facet.triangle.b, facet.triangle.c])
		.flat(1);

	$: tabPoints = !showTabs
		? []
		: strut.facets
				.map((facet) => {
					if (facet.tab) {
						if (facet.tab.style === 'trapezoid') {
							const { a, b, c, d } = facet.tab.outer;
							return [a, b, d, b, c, d];
						} else if (facet.tab.style === 'full') {
							const { a, b, c } = facet.tab.outer;
							return [a, b, c];
						}
					}
					return [];
				})
				.flat(1);

	let edgeColor = 'black';
	let strutGeometry: BufferGeometry; // = new BufferGeometry()
	let tabGeometry: BufferGeometry;
	let edges: EdgesGeometry; // = new EdgesGeometry()
	const strutMaterial = new MeshPhysicalMaterial({
		color: 'orangered',
		transparent: true,
		opacity: 0.8,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	});
	const tabMaterial = new MeshPhysicalMaterial({
		color: 'green',
		transparent: true,
		opacity: 0.8,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	});

	const lineMaterial = new LineBasicMaterial({ color: 'black' });

	$: {
		edgeColor = 'black';
		strutGeometry = new BufferGeometry().setFromPoints(bandPoints);
		strutGeometry.computeVertexNormals();
		edges = new EdgesGeometry(strutGeometry.clone().scale(1, 1, 1), 1);
	}

	$: {
		tabGeometry = new BufferGeometry().setFromPoints(tabPoints);
		tabGeometry.computeVertexNormals();
	}
</script>

<T.Group>
	<T.LineSegments geometry={edges} material={lineMaterial} />
	<T.Mesh geometry={strutGeometry} material={strutMaterial} />
	{#if showTabs}
		<T.Mesh geometry={tabGeometry} material={tabMaterial} />
	{/if}
</T.Group>
