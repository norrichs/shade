<script lang="ts">
	import type { Band, Facet, GlobuleGeometry } from '$lib/types';
	import { T } from '@threlte/core';
	import {
		DoubleSide,
		BufferGeometry,
		EdgesGeometry,
		LineBasicMaterial,
		MeshPhysicalMaterial
	} from 'three';
	import { materials } from '../../components/three-renderer-v2/materials'

	export let globuleGeometry: GlobuleGeometry;
	export let selected = false;

	let material: MeshPhysicalMaterial = new MeshPhysicalMaterial({
		color: 'orange',
		transparent: true,
		opacity: 0.95,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	});

	let bandGeometry: BufferGeometry;

	const lineMaterial = new LineBasicMaterial({ color: 'lightgrey' });

	$: {
		bandGeometry = new BufferGeometry().setFromPoints(globuleGeometry.points);
		bandGeometry.computeVertexNormals();
	}
</script>

<T.Group>
	<T.Mesh geometry={bandGeometry} material={materials[selected ? 'selected' : 'default']} />
</T.Group>
