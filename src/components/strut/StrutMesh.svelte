<script lang="ts">
  import { T } from '@threlte/core' 
  import { Edges } from '@threlte/extras'
	import { DoubleSide, CurvePath, BufferGeometry, MeshNormalMaterial } from 'three';
	import { degToRad } from 'three/src/math/MathUtils'
	import type { LevelConfig } from '../../lib/shade';
  import type {StrutGroup, Strut} from '../../lib/shade'

  export let strutGroup: StrutGroup

  // const points = [
  //   ...strut.left.t0.getPoints().slice(1,4), 
  //   ...strut.left.t0.getPoints().slice(1,4), 
  //   ...strut.left.t0.getPoints().slice(1,4)
  // ]
  // console.debug("points", points)
  // const geometry = new BufferGeometry()
  // geometry.setFromPoints(points)
  // geometry.computeVertexNormals()

  const material = new MeshNormalMaterial()
  material.side = DoubleSide
  const geometry1 = new BufferGeometry()
  geometry1.setFromPoints(strutGroup.left.t0)
  geometry1.computeVertexNormals()
  const geometry2 = new BufferGeometry()
  geometry2.setFromPoints(strutGroup.left.t1)
  geometry2.computeVertexNormals()
  const geometry3 = new BufferGeometry()
  geometry3.setFromPoints(strutGroup.left.t2)
  geometry3.computeVertexNormals()

  const geometry4 = new BufferGeometry()
  geometry4.setFromPoints(strutGroup.right.t0)
  geometry4.computeVertexNormals()
  const geometry5 = new BufferGeometry()
  geometry5.setFromPoints(strutGroup.right.t1)
  geometry5.computeVertexNormals()
  const geometry6 = new BufferGeometry()
  geometry6.setFromPoints(strutGroup.right.t2)
  geometry6.computeVertexNormals()



</script>

<!-- <T.Mesh args={[geometry, material]} /> -->
<T.Group >
  <T.Mesh args={[geometry1, material]}>
    <Edges color="black"/>
  </T.Mesh>
  <T.Mesh args={[geometry2, material]} >
    <Edges color="black"/>
  </T.Mesh>
  <T.Mesh args={[geometry3, material]} >
    <Edges color="black"/>
  </T.Mesh>
  <T.Mesh args={[geometry4, material]} >
    <Edges color="black"/>
  </T.Mesh>
  <T.Mesh args={[geometry5, material]} >
    <Edges color="black"/>
  </T.Mesh>
  <T.Mesh args={[geometry6, material]} >
    <Edges color="black"/>
  </T.Mesh>
</T.Group>