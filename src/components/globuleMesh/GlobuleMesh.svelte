<script lang="ts">
	import type { BandGeometry, GlobuleGeometry } from '$lib/types';
	import { T } from '@threlte/core';
	import { BufferGeometry } from 'three';
	import { materials, type Material } from '../../components/three-renderer/materials';

	let {
		geometry,
		material = 'default'
	}: {
		geometry: GlobuleGeometry | BandGeometry;
		material?: Material;
	} = $props();

	let bufferGeometry: BufferGeometry | undefined = $state(undefined);

	$effect(() => {
		if (!!geometry?.points) {
			bufferGeometry = new BufferGeometry().setFromPoints(geometry.points);
			bufferGeometry.computeVertexNormals();
		}
	});
</script>

<T.Group>
	<T.Mesh geometry={bufferGeometry} material={materials[material]} />
</T.Group>
