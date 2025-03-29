<script lang="ts">
	import { T } from '@threlte/core';
	import {
		generatePolyhedron,
		generateProjection,
		generateSphereInstance,
		generateTubeBands,
		prepareProjectionConfig
	} from '$lib/projection-geometry/generate-projection';
	import { materials } from '../three-renderer-v2/materials';
	import { defaultProjectionConfig } from '$lib/projection-geometry/configs';
	import { BufferGeometry, DodecahedronGeometry, Vector3 } from 'three';
	import {
		collateBandGeometry,
		collatePolygonGeometry,
		collatePolyhedronGeometry,
		collateProjectionGeometry,
		collateSectionGeometry
	} from '$lib/projection-geometry/collate-geometry';
	import { getVector3 } from '$lib/util';

	const handleClick = (ev: any) => {
		console.debug('clicked ', ev);
	};
	const projectionConfig = defaultProjectionConfig;
	const preparedProjectionConfig = prepareProjectionConfig(projectionConfig);
	const { projectorConfig, surfaceConfig, bandConfig } = preparedProjectionConfig;

	const { sphereGeometry, sphere } = generateSphereInstance(surfaceConfig);

	const polyhedron = generatePolyhedron(projectorConfig);
	const projection = generateProjection({
		surface: sphere,
		projector: polyhedron,
		projectionConfig: preparedProjectionConfig
	});

	// const { projectionGeometry, crossSectionGeometry } = collateProjectionGeometry(
	// 	projection,
	// 	getVector3(projectionConfig.surfaceConfig.center) as Vector3
	// );
	const polyhedronGeometry = collatePolyhedronGeometry(polyhedron);
	const polygonsGeometry = polyhedron.polygons.map((p) => collatePolygonGeometry(p));

	const { tubes } = generateTubeBands(projection, projectionConfig);

	// console.debug({ tubes });

	const sectionsGeometry = collateSectionGeometry(tubes.map((tube) => tube.sections).flat(1));
	const bandsGeometry = collateBandGeometry(tubes.map((tube) => tube.bands).flat());
	// const sectionsGeometry = collateSectionGeometry(tubes[1].sections);
	// const {projectionPoints} = generateProjection()
</script>

<T.Group position={[0, 0, 0]} on:click={(ev) => handleClick(ev)}>
	<!-- <T.Mesh geometry={sphereGeometry} material={materials.selectedVeryLight} /> -->
	<!-- <T.Mesh geometry={polyhedronGeometry} material={materials.numbered[0]} /> -->
	{#each polygonsGeometry as p, i}
		<T.Mesh geometry={p} material={materials.numbered[i]} />
	{/each}
	{#each bandsGeometry as b, i}
		<T.Mesh geometry={b} material={materials.selectedLight} />
	{/each}
	<!-- <T.Mesh geometry={projectionGeometry} material={materials.highlightedSecondary} /> -->
	<!-- <T.Mesh geometry={crossSectionGeometry} material={materials.default} /> -->
	<T.Mesh geometry={sectionsGeometry} material={materials.highlightedPrimary} />
</T.Group>
