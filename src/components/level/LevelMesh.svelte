<script lang="ts">
  import { T } from '@threlte/core' 
  import { Edges } from '@threlte/extras'
	import { DoubleSide, CurvePath, BufferGeometry, MeshNormalMaterial } from 'three';
	import { degToRad } from 'three/src/math/MathUtils'
	import type { LevelConfig } from '../../lib/shade';
  import type {Level} from '../../lib/shade'

  export let level: Level

  let geometries = level.map((v0, vIndex, level) => {
    const v1 = level[(vIndex+1) % level.length ]
    const geometry = new BufferGeometry()
    geometry.setFromPoints([
      v0.inner,
      v0.outer,
      v1.outer,

      v0.inner,
      v1.outer,
      v1.inner
    ])
    geometry.computeVertexNormals()
    return geometry
  })

  const material = new MeshNormalMaterial()
  material.side = DoubleSide
  

</script>

{#each geometries as geometry, i}
  <!-- {#if i === 0 } -->
  <T.Mesh args={[geometry, material]}>
    <Edges color="black"/>
  </T.Mesh>
  <!-- {/if} -->
{/each}