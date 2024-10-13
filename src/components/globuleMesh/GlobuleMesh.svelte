<script lang="ts">
	import type { GlobuleGeometry } from '$lib/types';
	import { T } from '@threlte/core';
	import { BufferGeometry } from 'three';
	import { materials } from '../../components/three-renderer-v2/materials';

	export let globuleGeometry: GlobuleGeometry;
	export let selected = false;

	let bandGeometry: BufferGeometry;

	$: {
		bandGeometry = new BufferGeometry().setFromPoints(globuleGeometry.points);
		bandGeometry.computeVertexNormals();
	}
</script>

<T.Group>
	<T.Mesh geometry={bandGeometry} material={materials[selected ? 'selected' : 'default']} />
</T.Group>
