<script lang="ts">
	import { T } from '@threlte/core' 
  import { Edges } from '@threlte/extras'
	import { DoubleSide, EllipseCurve, Path, Shape, Vector2 } from 'three';
	import { degToRad } from 'three/src/math/MathUtils'
	import type { LevelConfig } from '../../lib/shade';

  export let config: LevelConfig;
  export let offset: {
    x?: number; 
    y?: number; 
    z?: number;
    rotx?: number;
    roty?: number;
    rotz?: number;
  }
  export let index: number;
  export let radius: number 
  export let width: number
  export let sides: number
  export let colors: string[] = ["rgb(200, 10, 10)","rgb(10, 200, 10)","rgb(10, 10, 200)", "rgb(200, 200, 10)", "rgb(10, 200, 200)", "rgb(200, 10, 200)",
  "rgb(200, 100, 100)","rgb(100, 200, 100)","rgb(100, 100, 200)", "rgb(200, 200, 100)", "rgb(100, 200, 200)", "rgb(200, 100, 200)"
]
  const arcShape = new Shape()
  arcShape.moveTo(radius - width, 0)
  arcShape.lineTo(radius, 0)
  arcShape.absarc(0, 0, radius, 0, degToRad(360 / sides), false);
  const next = arcShape.currentPoint.addScaledVector(arcShape.currentPoint, -1 * width / radius)
  arcShape.lineTo(next.x , next.y)
  arcShape.absarc(0, 0, radius - width, degToRad(360 / sides), 0, true)
  // arcShape.lineTo(0, radius)

  let angles = new Array(sides)
  angles.fill(0)
  angles = angles.map((a, i) => degToRad(360/sides) * i)
</script>


{#each angles as angle, i}
  {#if i > -1}
  <T.Mesh 
    rotation.x={config.offset.rotx || 0} 
    rotation.y={config.offset.roty || 0} 
    rotation.z={angle + (index * degToRad(360 / sides / 2)) + (config.offset.rotz || 0) } 
    
    position.z={offset.z} 
    position.y={offset.y} 
    position.x={offset.x} 
    castShadow
  >    
    <T.ShapeGeometry  args={[arcShape]}/>
    <Edges threshold={1} color="black" scale={1} />
    <T.MeshStandardMaterial side={DoubleSide} color={colors[i % colors.length]} />
  </T.Mesh>
  {/if}
{/each}