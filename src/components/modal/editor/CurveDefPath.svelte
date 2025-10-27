<script lang="ts">
	import type { BezierConfig } from '$lib/types';

	export let curveDef: BezierConfig[];
	export let id: string | undefined = undefined;


  const getPathString = (curveDef: BezierConfig[]) => {
    return curveDef.reduce((pathString, curve) => {
      return pathString + `C ${curve.points[1].x} ${curve.points[1].y} ${curve.points[2].x} ${curve.points[2].y} ${curve.points[3].x} ${curve.points[3].y}`;
    }, `M ${curveDef[0].points[0].x} ${curveDef[0].points[0].y}`);
  }
	$: pathString = getPathString(curveDef);
</script>

<path {id} d={pathString} />

<style>
  path {
    fill: none;
    stroke: black;
    stroke-width: 0.01
  }
</style>
