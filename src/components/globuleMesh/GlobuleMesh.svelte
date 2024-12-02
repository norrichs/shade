<script lang="ts">
	import type { BandGeometry, GlobuleGeometry } from '$lib/types';
	import { T } from '@threlte/core';
	import { BufferGeometry } from 'three';
	import { materials, type Material } from '../../components/three-renderer-v2/materials';

	export let geometry: GlobuleGeometry | BandGeometry;
	export let material: Material = 'default';
	// export let selectable = true;

	let bufferGeometry: BufferGeometry;

	const update = (geometry: GlobuleGeometry | BandGeometry) => {
		if (!!geometry?.points) {
			bufferGeometry = new BufferGeometry().setFromPoints(geometry?.points);
			bufferGeometry.computeVertexNormals();
		}
	};

	$: update(geometry);
</script>

<T.Group>
	<T.Mesh geometry={bufferGeometry} material={materials[material]} />
</T.Group>
