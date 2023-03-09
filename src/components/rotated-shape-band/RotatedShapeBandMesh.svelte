<script lang="ts">
  import { T } from '@threlte/core' 
  import { Edges } from '@threlte/extras'
	import { DoubleSide, CurvePath, BufferGeometry, MeshNormalMaterial } from 'three';
  import type {Band} from '../../lib/rotated-shape'

  export let rsband: Band

  $: points = rsband.facets.map((facet) => {
    return [
      facet.triangle.a,
      facet.triangle.b,
      facet.triangle.c,
    ]
  }).flat(1)

  let edgeColor = "black"
  const geometry = new BufferGeometry()
  const material = new MeshNormalMaterial()
  
  $: {
    material.side = DoubleSide
    edgeColor = "black"
    geometry.setFromPoints(points)
    geometry.computeVertexNormals()
  }
  

</script>


<T.Mesh args={[geometry, material]}>
  <Edges color={edgeColor}/>
</T.Mesh>
