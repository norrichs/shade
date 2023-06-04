<script lang="ts">
	import { T } from '@threlte/core';
	import { Edges } from '@threlte/extras';
	import { DoubleSide, CurvePath, BufferGeometry, MeshNormalMaterial } from 'three';
	import type { Ring } from '$lib/shade';

	export let ring: Ring;

	let geometries = ring.map((v0, vIndex, ring) => {
		const v1 = ring[(vIndex + 1) % ring.length];
		const geometry = new BufferGeometry();
		geometry.setFromPoints([
			v0.left.inner,
			v0.left.outer,
			v0.right.outer,

			v0.left.inner,
			v0.right.outer,
			v0.right.inner,

			v0.right.inner,
			v0.right.outer,
			v1.left.outer,

			v0.right.inner,
			v1.left.outer,
			v1.left.inner
		]);
		geometry.computeVertexNormals();
		return geometry;
	});

	const material = new MeshNormalMaterial();
	material.side = DoubleSide;
</script>

{#each geometries as geometry, i}
	<!-- {#if i===0} -->
	<T.Mesh args={[geometry, material]}>
		<Edges color="black" />
	</T.Mesh>
	<!-- {/if} -->
{/each}
