<script lang="ts">
	import { Canvas, OrbitControls, T } from '@threlte/core';
	import { degToRad } from 'three/src/math/MathUtils';
	import StrutMesh from '../../components/strut/StrutMesh.svelte';
	import type { RotatedShapeLevel, Band, RenderConfig, Strut } from '../../lib/rotated-shape';
	import { getRenderable } from "../../lib/rotated-shape"
  import RotatedShapeLevelMesh from '../rotated-shape-level/RotatedShapeLevelMesh.svelte';
  import RotatedShapeBandMesh from '../rotated-shape-band/RotatedShapeBandMesh.svelte';
	import {config} from "../../lib/stores"

	export let rslevels: RotatedShapeLevel[] = [];
  export let rsbands: Band[] = []
	export let struts: Strut[] = [];

	let displayRSBands: Band[]
	let displayStruts: Strut[]
	let displayLevels: RotatedShapeLevel[]

	$: {
		displayRSBands = getRenderable($config.renderConfig, rsbands) as Band[]
	}
	$: {
		if (struts.length > 0) {
			displayStruts = getRenderable($config.renderConfig, struts) as Strut[]
		}
	}
	$: {
		if (rslevels.length > 0) {
			displayLevels = getRenderable($config.renderConfig, rslevels) as RotatedShapeLevel[]
		}
	}


</script>

<div>last vertex</div>
<!-- <div>{lastVertex}</div> -->
<Canvas>
	<T.PerspectiveCamera makeDefault position={[0, 600, -5]} fov={50}>
		<OrbitControls maxPolarAngle={degToRad(160)} enableZoom={true} target={{ y: 0.5 }} />
	</T.PerspectiveCamera>

	<T.DirectionalLight castShadow position={[3, 10, 10]} />
	<T.DirectionalLight position={[-3, 10, -10]} intensity={0.5} />
	<T.AmbientLight intensity={0.2} />

	<T.Group position={[0, 0, 0]}>
    {#if $config.renderConfig?.show?.levels}
      {#each displayLevels as rslevel}
        <RotatedShapeLevelMesh {rslevel} />
      {/each}
    {/if}

		{#if $config.renderConfig?.show?.bands}
			{#each displayRSBands as rsband, i}
				<RotatedShapeBandMesh {rsband} showTabs={$config.renderConfig?.show?.tabs} />
			{/each}
		{/if}
		{#if $config.renderConfig?.show?.struts}
			{#each displayStruts as strut}
				<StrutMesh {strut} showTabs={false} />
			{/each}
		{/if}
	</T.Group>
</Canvas>
