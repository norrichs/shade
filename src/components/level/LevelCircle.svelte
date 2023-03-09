<script lang="ts">
	import { T } from '@threlte/core' 
	import { degToRad } from 'three/src/math/MathUtils'

  export let offset: {
    x?: number; 
    y?: number; 
    z?: number;
  }
  export let radius: number = 1;

</script>

<T.Mesh position.y={offset.y} position.x={1} position.z={1} castShadow rotation.x={degToRad(-90)}>
  <T.CircleGeometry args={[radius, 180]} />
  <T.MeshStandardMaterial color="rgb(0, 0, 200)" />
</T.Mesh>