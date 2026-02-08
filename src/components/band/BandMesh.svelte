<script lang="ts">
	import type { Band } from '$lib/types';
	import { T } from '@threlte/core';
	import {
		DoubleSide,
		BufferGeometry,
		EdgesGeometry,
		LineBasicMaterial,
		MeshPhysicalMaterial
	} from 'three';

	let {
		band,
		showTabs = true,
		material
	}: {
		band: Band;
		showTabs?: boolean;
		material: MeshPhysicalMaterial;
	} = $props();

	let bandPoints = $derived(
		band.facets
			.map((facet) => [facet.triangle.a, facet.triangle.b, facet.triangle.c])
			.flat(1)
	);

	let tabPoints = $derived(
		!showTabs
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
					.flat(1)
	);

	const bandMaterial = new MeshPhysicalMaterial({
		color: 'orange',
		transparent: true,
		opacity: 0.95,
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

	const lineMaterial = new LineBasicMaterial({ color: 'lightgrey' });

	let bandGeometry: BufferGeometry = $state(new BufferGeometry());
	let edges: EdgesGeometry = $state(new EdgesGeometry());
	let tabGeometry: BufferGeometry = $state(new BufferGeometry());

	$effect(() => {
		bandGeometry = new BufferGeometry().setFromPoints(bandPoints);
		bandGeometry.computeVertexNormals();
		edges = new EdgesGeometry(bandGeometry.clone().scale(1, 1, 1), 1);
	});

	$effect(() => {
		tabGeometry = new BufferGeometry().setFromPoints(tabPoints);
		tabGeometry.computeVertexNormals();
	});
</script>

<T.Group>
	<!-- <T.LineSegments geometry={edges} material={lineMaterial} /> -->
	<T.Mesh geometry={bandGeometry} {material} />
	{#if showTabs}
		<T.Mesh geometry={tabGeometry} material={tabMaterial} />
	{/if}
</T.Group>
