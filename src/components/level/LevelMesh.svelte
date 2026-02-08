<script lang="ts">
	import type { Level } from '$lib/types';
	import { T } from '@threlte/core';
	import { Edges } from '@threlte/extras';
	import { DoubleSide, BufferGeometry, MeshNormalMaterial } from 'three';

	let { level }: { level: Level } = $props();

	let points = $derived(
		level.vertices
			.map((vertex, i, vertices) => {
				return [vertex, level.center, vertices[(i + 1) % vertices.length]];
			})
			.flat(1)
	);

	let geometry = $derived.by(() => {
		const g = new BufferGeometry();
		g.setFromPoints(points);
		g.computeVertexNormals();
		return g;
	});

	const material = new MeshNormalMaterial({ side: DoubleSide });
</script>

<T.Mesh args={[geometry, material]}>
	<Edges color="black" />
</T.Mesh>
