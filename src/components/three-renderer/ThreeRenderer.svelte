<script lang="ts">
	import { Canvas, InteractiveObject, OrbitControls, T } from '@threlte/core';
	import { spring } from 'svelte/motion';
	import { Edges } from '@threlte/extras';
	import { degToRad } from 'three/src/math/MathUtils';
	import LevelCircle from '../../components/level/LevelCircle.svelte';
	import LevelSegmentMesh from '../../components/level/LevelSegmentMesh.svelte';
	import StrutMesh from '../../components/strut/StrutMesh.svelte';
	import LevelMesh from '../../components/level/LevelMesh.svelte';
	import RingMesh from '../../components/ring/RingMesh.svelte';
	import type { LevelConfig } from '../../lib/shade';
	import { getShade } from '../../lib/shade';
	import type { Ring, Level, StrutGroup, RibbonGroup } from '../../lib/shade';
	import type { RotatedShapeLevel, Band } from '../../lib/rotated-shape';
	import RibbonMesh from '../strut/RibbonMesh.svelte';
  import RotatedShapeLevelMesh from '../rotated-shape-level/RotatedShapeLevelMesh.svelte';
  import RotatedShapeBandMesh from '../rotated-shape-band/RotatedShapeBandMesh.svelte';

	export let rslevels: RotatedShapeLevel[] = [];
  export let rsbands: Band[] = []
	export let rings: Ring[] = [];
	export let levels: Level[] = [];
	export let struts: StrutGroup[][] = [];
	export let ribbons: RibbonGroup[] = [];

	console.debug("ThreeRender rsbands", rsbands)

	let showLevels = false;
	let showRings = false;
	let showRibbons = 0;
	let showStruts = false;
	let strutLimit = 100;
  let showRSLevels = false;
  let showRSBands = true;
	let rsBandConfig = {bandStart: 0, bandCount: 100, facetStart: 0, facetCount: 100}

	$: displayRSBands = rsbands
		.slice(rsBandConfig.bandStart, rsBandConfig.bandCount + rsBandConfig.bandStart)
		.map(band => ({...band, facets: band.facets.slice(rsBandConfig.facetStart, rsBandConfig.facetCount + rsBandConfig.facetStart)}))

	$: displaylevels = rslevels.slice(0,20)

</script>

<div>last vertex</div>
<!-- <div>{lastVertex}</div> -->
<Canvas>
	<T.PerspectiveCamera makeDefault position={[0, 100, -5]} fov={50}>
		<OrbitControls maxPolarAngle={degToRad(160)} enableZoom={true} target={{ y: 0.5 }} />
	</T.PerspectiveCamera>

	<T.DirectionalLight castShadow position={[3, 10, 10]} />
	<T.DirectionalLight position={[-3, 10, -10]} intensity={0.5} />
	<T.AmbientLight intensity={0.2} />

	<T.Group position={[0, 0, -30]}>
    {#if showRSLevels}
      {#each displaylevels as rslevel}
        <RotatedShapeLevelMesh {rslevel} />
      {/each}
    {/if}

		{#if showRSBands}
			{#each displayRSBands as rsband, i}
				<RotatedShapeBandMesh {rsband} />
			{/each}
		{/if}


		{#if showLevels}
			{#each levels as level, l}
				{#if l === 0 || l === levels.length - 1}
					<LevelMesh {level} />
				{/if}
			{/each}
		{/if}
		{#if showRings}
			{#each rings as ring}
				<RingMesh {ring} />
			{/each}
		{/if}

		{#if showStruts}
			{#each struts as strutLevel}
				{#each strutLevel as strutGroup, i}
					{#if i < strutLimit}
						<StrutMesh {strutGroup} />
					{/if}
				{/each}
			{/each}
		{/if}

		{#if !!showRibbons}
			{#each ribbons as ribbon, i}
				{#if i < showRibbons}
					<RibbonMesh {ribbon} config={{ doLeft: true, doRight: true }} />
				{/if}
			{/each}
		{/if}
	</T.Group>
</Canvas>
