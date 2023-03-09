<script lang="ts">
	// import type { Ring, Level, StrutGroup, RibbonGroup } from '../../lib/shade';
	import { Vector3 } from 'three';
	import type { RotatedShapeLevel, Band } from '../../lib/rotated-shape';
	import { generateBandPatterns } from '../../lib/cut-pattern';
	import type { PatternConfig, BandPattern } from '../../lib/cut-pattern';

	// export let rings: Ring[] = [];
	// export let levels: Level[] = [];
	// export let struts: StrutGroup[][] = [];
	// export let ribbons: RibbonGroup[] = [];
	export let rslevels: RotatedShapeLevel[] = [];
	export let rsbands: Band[] = [];

	let showRings = false;
	let showStruts = false;
	let showRibbons = true;
	let showLevels = false;
	let showRSBands = true;
	let showRSLevels = true;

	// const getRingPath = (ring: Ring): string => {
	//   // console.debug("getPath ring", ring)
	//   const outerPoints: Vector3[] = []
	//   const innerPoints: Vector3[] = []
	//   ring.forEach(vertex => {
	//     outerPoints.push(vertex.left.outer, vertex.right.outer)
	//     innerPoints.push(vertex.left.inner, vertex.right.inner)
	//   })

	//   // console.debug("inner", innerPoints)
	//   const inner = alignPerpendicularToAxis(innerPoints, new Vector3(0, 0, 1))
	//   const outer = alignPerpendicularToAxis(outerPoints, new Vector3(0, 0, 1))

	//   const path: string =
	//     outer.reduce((path, point, i) =>
	//       `${path}L ${point.x} ${point.y} `,
	//       `M ${outer[outer.length - 1].x} ${outer[outer.length - 1].y} `
	//     ) +
	//     inner.reduce((path, point, i) =>
	//       `${path}L ${point.x} ${point.y} `,
	//       `M ${inner[inner.length - 1].x} ${inner[inner.length - 1].y} `
	//     )
	//   // console.debug("path", path)
	//   return path;
	// }
	// const alignTriangleToAxis = (points: Vector3[], axis: Vector3 = new Vector3(0,0,1)) => {
	//   const relPoints = [
	//     new Vector3(0,0,0),
	//     new Vector3(0,0,0).addScaledVector(points[0].clone().addScaledVector(points[1], -1), -1),
	//     new Vector3(0,0,0).addScaledVector(points[0].clone().addScaledVector(points[2], -1), -1),
	//   ]
	//   const ortho = new Vector3().crossVectors(relPoints[1], relPoints[2])   // vector orthogonal to plane of triangle
	//   const rotational = new Vector3().crossVectors(ortho, axis).setLength(1)
	//   const angle = axis.angleTo(ortho)
	//   const flatPoints = [
	//     relPoints[0].clone(),
	//     relPoints[1].clone().applyAxisAngle(rotational, angle),
	//     relPoints[2].clone().applyAxisAngle(rotational, angle)
	//   ]
	//   console.debug("relPoints", relPoints, "ortho", ortho, "rotational", rotational, "angle", angle, "flatPoints", flatPoints)

	//   return flatPoints
	// }
	// const getStrutPath = (strut: Strut, origin: Vector3 = new Vector3(0,0,0)): string => {
	//   const zAxis = new Vector3(0,0,1)
	//   console.debug("getStrutPath", strut.t0)
	//   let t0 = alignTriangleToAxis(strut.t0)
	//   let t1 = alignTriangleToAxis(strut.t1)
	//   let t2 = alignTriangleToAxis(strut.t2)

	//   t0 = t0.map(p => p.addScaledVector(origin, 1))
	//   t1 = t1.map(p => p.addScaledVector(origin, 1))
	//   t2 = t2.map(p => p.addScaledVector(origin, 1))

	//   const angle_0_1 = t0[2].angleTo(t1[1])
	//   t1 = t1.map(p => p.applyAxisAngle(zAxis, -angle_0_1))

	//   const t1_1_2 = t1[2].clone().addScaledVector(t1[1], -1)
	//   const t2_0_2 = t2[2].clone().addScaledVector(t2[0], -1)
	//   const angle_1_2 = t1_1_2.angleTo(t2_0_2)
	//   t2 = t2.map(p => p.applyAxisAngle(new Vector3(0, 0, 1), -angle_1_2))
	//   t2 = t2.map(p => p.addScaledVector(t1[1],1))

	//   const points = [...t0, ...t1, ...t2]
	//   const path = points.reduce((path, point, i) => `${path}L ${point.x} ${point.y}`,`M ${points[0].x} ${points[0].y} `)
	//   return path
	// }

	const getViewBox = (width: number = 100, center: boolean = true, height?: number,) => {
    if (center) {
      return !height
        ? `-${0} -${width} ${width} ${width}`
        : `-${width / 2} -${height / 2} ${width} ${height}`;
    }
    return !height
        ? `-${width/100} -${width * 9 / 10} ${width} ${width}`
        : `-${10} -${10} ${width} ${height}`;
	};

	let displayBandsStart: number = 0;
	let displayBandsCount: number | "all" = "all";
	let displayFacetsStart: number = 0;
	let displayFacetsCount: number | 'all' = "all";
  let zoomLevel: number = 60
	let patternConfig: PatternConfig = {
		projectionType: 'flattened',
		axis: 'z',
		origin: new Vector3(0, 0, 0),
		direction: new Vector3(0, 3, 0)
	};

	const displayedFacets: Band[] = rsbands
		.slice(displayBandsStart, displayBandsStart + (displayBandsCount === "all" ? rsbands.length : displayBandsCount))
		.map((band) => ({
			...band,
			// @ts-ignore
			facets: band.facets.slice(
				displayFacetsStart,
				displayFacetsStart +
					(displayFacetsCount === 'all' ? band.facets.length : displayFacetsCount)
			)
		}));

	const patterns: BandPattern = generateBandPatterns(patternConfig, displayedFacets);
</script>

<div class="container">
	<!-- {#if rings.length > 0}
    <div class="rings">
      <label for="showRings">
        Rings
      </label>
      <input type="checkbox" name="showRings" bind:checked={showRings} />
      <div class="container-svg" class:showRings>
        <svg width="600" height="600" viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd">
          <path d={getRingPath(rings[1])}  fill="red" stroke="black" stroke-width="0.1"/>
        </svg>
      </div>
    </div>
  {/if}
  {#if struts.length > 0}
    <div class="struts">
      <label for="showStruts">
        Struts
      </label>
      <input type="checkbox" name="showStruts" bind:checked={showStruts} />
      <div class="container-svg" class:showStruts>
        <svg width="600" height="600" viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg">
          <path d={getStrutPath(struts[0][0].right)}  fill="red" stroke="black" stroke-width="0.1"/>
          <path d={getStrutPath(struts[0][1].right)}  fill="red" stroke="black" stroke-width="0.1"/>
          <path d={getStrutPath(struts[0][2].right)}  fill="red" stroke="black" stroke-width="0.1"/>
        </svg>
      </div>
    </div>
  {/if}
  {#if ribbons.length > 0}
    <div class="ribbons">
      <label for="showRibbons">
        Ribbons
      </label>
      <input type="checkbox" name="showRibbons" bind:checked={showRibbons} />
      <div class="container-svg" class:showRibbons>
        <svg width="400" height="400" viewBox="-7.5 -7.5 15 15" xmlns="http://www.w3.org/2000/svg">
          <path d={getStrutPath(ribbons[0].right[0], new Vector3(0,.1,0))}  fill="red" stroke="black" stroke-width="0.003"/>
        </svg>
      </div>
    </div>
  {/if} -->
	{#if rsbands.length > 0}
		<div class="rsbands">
			<label for="showRSBands"> RSBands </label>
			<input type="checkbox" name="showRSBands" bind:checked={showRSBands} />
			<div class="container-svg" class:showRSBands>
				<svg height="600" width="1400" viewBox={getViewBox(zoomLevel, false)} xmlns="http://www.w3.org/2000/svg">
					{#each patterns.bands as band}
						{#if patterns.projectionType === 'outlined'}
							<path d={band} fill="red" stroke="black" stroke-width="1" />
						{:else}
							{#each band.facets as facet, f}
								<path
									d={facet}
									fill={`rgba(${50 + (200 * f) / band.facets.length},0,0)`}
									stroke="black"
									stroke-width="0"
								/>
							{/each}
						{/if}
					{/each}
				</svg>
			</div>
		</div>
	{/if}
</div>

<style>
	.container {
		display: flex;
		flex-direction: row;
		justify-content: flex-start;
	}
	.container-svg {
		display: none;
		margin-top: 10px;
		padding: 20px;
		box-shadow: 0 0 10px 2px black;
	}
	.showRings {
		display: flex;
	}
	.showStruts {
		display: flex;
	}
	.showRibbons {
		display: flex;
	}
	.showRSBands {
		display: flex;
	}
</style>
