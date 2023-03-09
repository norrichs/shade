<script lang="ts">
  import { T } from '@threlte/core' 
  import { Edges } from '@threlte/extras'
	import { DoubleSide, CurvePath, BufferGeometry, MeshNormalMaterial } from 'three';
  import type {RotatedShapeLevel} from '../../lib/rotated-shape'

  export let rslevel: RotatedShapeLevel

  $: points = rslevel.vertices.map(((vertex, i, vertices )=> {
    return [
      vertex,
      rslevel.center,
      vertices[(i + 1) % vertices.length]
    ]
  })).flat(1)

  $: geometry = new BufferGeometry()
  $: geometry.setFromPoints(points)
  $: geometry.computeVertexNormals()

  const material = new MeshNormalMaterial()
  $: material.side = DoubleSide
  

</script>


<T.Mesh args={[geometry, material]}>
  <Edges color="black"/>
</T.Mesh>
