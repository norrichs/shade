<script lang="ts">
  import { T } from '@threlte/core' 
  import { Edges } from '@threlte/extras'
	import { DoubleSide, BufferGeometry, MeshNormalMaterial, Vector3 } from 'three';
  import type {RibbonGroup} from '../../lib/shade'

  export let ribbon: RibbonGroup;
  export let config: {
    doLeft: Boolean;
    doRight: Boolean;
  } = {
    doLeft: true,
    doRight: true
  }

  console.debug("RM ribbon", ribbon, ribbon.left.flat())
  
  const material = new MeshNormalMaterial()
  material.side = DoubleSide
  const geometry = {
    left: new BufferGeometry(),
    right: new BufferGeometry()
  }
  geometry.left.setFromPoints(ribbon.left.flat(1))
  geometry.right.setFromPoints(ribbon.right.flat(1))
  geometry.left.computeVertexNormals()
  geometry.right.computeVertexNormals()

  console.debug("RibbonMesh", geometry)




</script>

<!-- <T.Mesh args={[geometry, material]} /> -->
<T.Group >
  {#if config.doLeft}
    <T.Mesh args={[geometry.left, material]}>
      <Edges color="black"/>
    </T.Mesh>
  {/if}
  {#if config.doRight}
    <T.Mesh args={[geometry.right, material]}>
      <Edges color="black"/>
    </T.Mesh>
  {/if}
</T.Group>