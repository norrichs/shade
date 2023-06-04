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
	import type { Band, TabStyle } from '$lib/rotated-shape';

	export let band: Band;
	export let showTabs: boolean = true;

	$: bandPoints = band.facets
		.map((facet) => [facet.triangle.a, facet.triangle.b, facet.triangle.c])
		.flat(1);

	$: tabPoints = !showTabs
		? []
		: band.facets
				.map((facet) => {
					if (facet.tab && facet.tab.style === 'full') {
						const { a, b, c } = facet.tab.outer;
						return [a, b, c];
					} else if (
						facet.tab &&
						['trapezoid', 'multi-facet-full', 'multi-facet-trap'].includes(facet.tab.style)
					) {
						const { a, b, c, d } = facet.tab.outer;
						return [a, b, c, a, c, d];
					}
					return [];
				})
				.flat(1);
	// $: tabPoints2 = !showTabs
	// 	? []
	// 	: band.facets
	// 			.map((facet) => {
	// 				if (facet.tab?.style === "full") {
	// 					return [
	// 						facet.tab.footprint.triangle.a,
	// 						facet.tab.footprint.triangle.b,
	// 						facet.tab.footprint.triangle.c
	// 					];
	// 				}
	// 				return [];
	// 			})
	// 			.flat(1);

	let edgeColor = 'magenta';
	let bandGeometry: BufferGeometry; // = new BufferGeometry()
	let tabGeometry: BufferGeometry;
	// let tabGeometry2: BufferGeometry;
	let edges: EdgesGeometry; // = new EdgesGeometry()
	const bandMaterial = new MeshPhysicalMaterial({
		color: 'aqua',
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
	const tabMaterial2 = new MeshPhysicalMaterial({
		color: 'red',
		transparent: true,
		opacity: 0.8,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	});

	const lineMaterial = new LineBasicMaterial({ color: 'black' });

	$: {
		edgeColor = 'black';
		bandGeometry = new BufferGeometry().setFromPoints(bandPoints);
		bandGeometry.computeVertexNormals();
		edges = new EdgesGeometry(bandGeometry.clone().scale(1, 1, 1), 1);
	}

	$: {
		tabGeometry = new BufferGeometry().setFromPoints(tabPoints);
		// tabGeometry2 = new BufferGeometry().setFromPoints(tabPoints2);
		tabGeometry.computeVertexNormals();
		// tabGeometry2.computeVertexNormals();
	}
</script>

<T.Group>
	<T.LineSegments geometry={edges} material={lineMaterial} />
	<!-- <T.EdgesGeometry color="black" args={[geometry, 0.01]} /> -->
	<T.Mesh geometry={bandGeometry} material={bandMaterial} />
	{#if showTabs}
		<T.Mesh geometry={tabGeometry} material={tabMaterial} />
		<!-- <T.Mesh geometry={tabGeometry2} material={tabMaterial2} /> -->
	{/if}
</T.Group>
<!-- <T.BufferGeometry args={[points]} /> -->
<!-- <Edges color={edgeColor}/> -->
<!-- </T.Mesh> -->
<!-- <T.EdgesGeometry args={[geometry]} /> -->
