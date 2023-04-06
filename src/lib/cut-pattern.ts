import { Vector3, Triangle } from "three"
import type { Band, BandStyle, Facet, TabStyle } from "./rotated-shape"
import { generateFullTab, generateTrapTab } from "./rotated-shape"

export type PatternConfig = 
  | { projectionType: "faceted", axis: Axis, origin: Vector3, direction: Vector3, offset: Vector3, bandStyle: BandStyle }
  | { projectionType: "outlined", axis: Axis, origin: Vector3, direction: Vector3, offset: Vector3, bandStyle: BandStyle }


export type FacetPattern = {
  svgPath: string;
  triangle: Triangle;
  tab?: {
    svgPath: string;
    triangle: Triangle
  }
}

export type OutlinePattern = {
  outline:{
    svgPath: string;
    points: Vector3[]
  },
  scoring?: ({
    svgPath: string;
    points: Vector3[]
  } | undefined)[],
  cutouts?: {
    svgPath: string;
    points: Vector3[]
  }

}

export type BandPattern = FacetedBandPattern | OutlinedBandPattern

export type FacetedBandPattern = { projectionType: "faceted", bands: { facets: FacetPattern[] }[] }
export type OutlinedBandPattern = { projectionType: "outlined", bands: OutlinePattern[] }

type Axis = "z" | "x" | "y"

export type TrianglePoint = "a" | "b" | "c"

type AlignTrianglesConfig = {
  isEven: boolean,
  lead: {
    vec: Vector3,
    p: TrianglePoint,
  },    // front point of prevTriangle to be aligned against
  follow: {
    vec: Vector3,
    p: TrianglePoint,
  },  // back point of prevTriangle to be aligned against
}
type FlatStripConfig = {
  bandStyle: BandStyle,
  origin?: Vector3,
  direction?: Vector3,
}


const orderedPointsList = (points: { [key: string]: Vector3 }) => {
  return Object.entries(points)
  .sort((a, b) => {
    if (a[0] < b[0]) return 1
    if (a[0] > b[0]) return -1
    return 0
  })
  .map(entry => entry[1])
}

const getOutlinePoints = (band: Band, bandStyle: BandStyle): Vector3[] => {
  console.debug("  *** getOutlinePoints")
  const points: Vector3[] = []
  if (bandStyle === "circumference" || bandStyle === "helical-right") {
    console.debug("circ")
      // top edges
    let { lead, follow } = generateEdgeConfig(bandStyle, false, true)
    console.debug("  lead", lead, "follow", follow, bandStyle)
    
    for (let i = 1; i < band.facets.length; i += 2) {
      const facet = band.facets[i]
      console.debug("    facet", facet)
      points.push(facet.triangle[follow])
      if (facet.tab) {
        points.push(...orderedPointsList(facet.tab.outer))
      }
    }
    
    points.push(band.facets[band.facets.length - 1].triangle[lead])
    const swap = lead
    lead = follow
    follow = swap
    console.debug("  lead", lead, "follow", follow, bandStyle)

    for (let i = band.facets.length - 2; i >= 0; i -= 2) {
      const facet = band.facets[i]
      points.push(facet.triangle[lead])
      if (facet.tab) {
        points.push(
          ...Object.entries(facet.tab.outer)
            .sort((a, b) => {
              if (a[0] < b[0]) return -1
              if (a[0] > b[0]) return 1
              return 0
            })
            .map(entry => entry[1])
        )
      }
    }

    points.push(band.facets[0].triangle[follow])
  }

  return points
}

export const generateBandPatterns = (config: PatternConfig, tabStyle: TabStyle, bands: Band[]): BandPattern | undefined => {
  console.debug ("*** generate band patterns config", config)

  const flattenedGeometry: Band[] = bands.map((band, i) => getFlatStrip(band, tabStyle, {
    bandStyle: config.bandStyle, origin: config.origin.clone().addScaledVector(config.offset, i), direction: config.direction
  }))

  if (config.projectionType === "faceted") {
    const facetedPattern: FacetedBandPattern = {
      projectionType: "faceted",
      bands: flattenedGeometry.map((flatBand) => {
        const bandPattern = {
          ...flatBand,
          facets: flatBand.facets.map(facet => {
            // console.debug("--- map pattern", i, facet.tab ? "+ tab" : "no tab")
            const pattern: FacetPattern = {
              svgPath: getPathFromPoints([facet.triangle.a, facet.triangle.b, facet.triangle.c]),
              triangle: facet.triangle.clone(),
              tab: facet.tab ? {
                svgPath: getPathFromPoints(orderedPointsList(facet.tab.outer)),
                triangle: facet.tab.footprint.triangle.clone()
              } : undefined
            }
            return pattern
          })
        }
        return bandPattern
      })
    }
    return facetedPattern

  } else if (config.projectionType === "outlined") {
    console.debug("   OUTLINED")
    const outlinedPattern: OutlinedBandPattern = {
      projectionType: "outlined",
      bands: flattenedGeometry.map((flatBand) => {
        const outline: Vector3[] = getOutlinePoints(flatBand, config.bandStyle)
        console.debug("outline points", outline)
        const pattern: OutlinePattern = {
          outline: {
            points: outline,
            svgPath: getPathFromPoints(outline)
          }
        }
        if (tabStyle.scored) {
          pattern.scoring = flatBand.facets.map((facet) => {
            return facet.tab?.scored ? {
              points: [facet.tab.scored.a, facet.tab?.scored.b],
              svgPath: getPathFromPoints([facet.tab.scored.a, facet.tab?.scored.b])
            } : undefined
          })
        }
        return pattern
      })
    }
    return outlinedPattern
  }
}

const getLength = (p0: Vector3, p1: Vector3): number => {
  return p0.clone().addScaledVector(p1, -1).length()
}

const alignTriangle = (triangle: Triangle, config: AlignTrianglesConfig): Triangle => {
  const parity = config.isEven ? 1 : -1
  const zAxis = new Vector3(0, 0, 1)
  const pointSet: TrianglePoint[] = ["a", "b", "c"]

  const pivot = config.lead.p  // pivot is the same point as prevTriangle[config.follow], but has the same label as config.lead
  const constrained = config.follow.p
  const free: TrianglePoint = pointSet.find(p => p !== constrained && p !== pivot) || "a"
  const segmentOldPivotFree = triangle[pivot].clone().addScaledVector(triangle[free], -1)
  const segmentOldPivotConstrained = triangle[pivot].clone().addScaledVector(triangle[constrained], -1)
  const len = segmentOldPivotFree.length()
  const angle = segmentOldPivotConstrained.angleTo(segmentOldPivotFree)

  const alignedTriangle = new Triangle()
  alignedTriangle[pivot] = config.follow.vec.clone()
  alignedTriangle[constrained] = config.lead.vec.clone()
  const segment = alignedTriangle[constrained].clone()
    .addScaledVector(alignedTriangle[pivot], -1)
    .setLength(len)
    .applyAxisAngle(zAxis, angle * parity)
  alignedTriangle[free] = segment.addScaledVector(alignedTriangle[pivot], 1)

  return alignedTriangle
}


const getFirstTriangleParity = (bandStyle: BandStyle): boolean => {
  console.debug("getFirstTriangleParity config", bandStyle)
  if (bandStyle === "helical-right") return false
  if (bandStyle === "helical-left") return true
  return true
} 

const getFlatStrip = (band: Band, tabStyle: TabStyle, flatStripConfig: FlatStripConfig) => {
  console.debug("getFlatStrip config", flatStripConfig)
  const config = {
    axis: new Vector3(0, 0 , 1),
    origin: new Vector3(0, 0, 0),
    direction: new Vector3(0, -1, 0),
    ...flatStripConfig
  }

  const flatStrip: Band = {...band, facets: []}
  
  band.facets.forEach((facet, i) => {
    const alignedFacet: Facet = { ...facet }
    
    // let edgeConfig
    let edgeConfig = generateEdgeConfig(flatStripConfig.bandStyle, Math.abs((i - 1) % 2) == 0)
    // console.debug("edgeConfig", flatStripConfig.bandStyle, i, Math.abs((i - 2) % 2), edgeConfig)
    let alignConfig: AlignTrianglesConfig
    if (i === 0) {
      const firstAlignedPoints: {pivot: TrianglePoint, constrained: TrianglePoint} = {pivot: "a", constrained: "c"}
      const firstLength = getLength(facet.triangle[firstAlignedPoints.pivot], facet.triangle[firstAlignedPoints.constrained])
      alignConfig = {
        isEven: getFirstTriangleParity(flatStripConfig.bandStyle),
        lead: { p: firstAlignedPoints.constrained, vec: config.direction.clone().setLength(firstLength).addScaledVector(config.origin, 1) },
        follow: { p: firstAlignedPoints.pivot, vec: config.origin.clone() },
      }
    } else {
      const prevFlatTriangle = flatStrip.facets[i - 1].triangle
      alignConfig = {
        isEven: Math.abs((i - 1) % 2) === 0,
        lead: { p: edgeConfig.lead, vec: prevFlatTriangle[edgeConfig.lead].clone() },
        follow: { p: edgeConfig.follow, vec: prevFlatTriangle[edgeConfig.follow].clone() },
      }
    }
    alignedFacet.triangle = alignTriangle(facet.triangle, alignConfig)
    

    if (facet.tab) {
      edgeConfig = generateEdgeConfig(config.bandStyle, i % 2 === 0, true)
      const tabAlignConfig = {
        isEven: Math.abs((i - 1) % 2) === 0,
        lead: { p: edgeConfig.lead, vec: alignedFacet.triangle[edgeConfig.lead].clone() },
        follow: { p: edgeConfig.follow, vec: alignedFacet.triangle[edgeConfig.follow].clone() }
      }
      const tabFootprint = alignTriangle(facet.tab.footprint.triangle, tabAlignConfig)
      
      if (tabStyle.style === "full") {
        alignedFacet.tab = generateFullTab(tabStyle, tabFootprint, edgeConfig)
      } else if (tabStyle.style === "trapezoid") {
        alignedFacet.tab = generateTrapTab(tabStyle, tabFootprint, edgeConfig)
      }

      // alignedFacet.tab = {
      //   ...facet.tab,
      //   footprint: {
      //     ...facet.tab.footprint,
      //     triangle: tabFootprint
      //   }
      // }
    }
    flatStrip.facets.push(alignedFacet)
  })

  return flatStrip
}

// Looks up the edge configuration for a given triangle
// "lead" is defined as:
//  the forwardmost vertex of a pair of vertices on the edge of the strip
// "follow" is defined as:
//    when the edge is conjoined with another strip triangle, the "single" vertex on the strip edge
//    when the edge is conjoined with a tab, the rearmost of the pair of vertices
export const generateEdgeConfig = (bandStyle: BandStyle, isEven: boolean, isTabEdge = false): {lead: TrianglePoint, follow: TrianglePoint} => {
  if (bandStyle === "circumference") {
    if (isEven && isTabEdge)        return { lead: "b", follow: "a" }
    else if (isEven && !isTabEdge)  return { lead: "b", follow: "c" }
    else if (!isEven && isTabEdge)  return { lead: "a", follow: "b" }
    else                        return { lead: "a", follow: "c" }
  } else if (bandStyle === "helical-right") {
    if (isEven && isTabEdge)        return { lead: "c", follow: "a" }
    else if (isEven && !isTabEdge)  return { lead: "c", follow: "b" }
    else if (!isEven && isTabEdge)  return { lead: "a", follow: "c" }
    else                        return { lead: "a", follow: "b" }
  } else {
    if (isEven && isTabEdge)        return { lead: "c", follow: "b" }
    else if (isEven && !isTabEdge)  return { lead: "c", follow: "a" }
    else if (!isEven && isTabEdge)  return { lead: "b", follow: "c" } 
    else                        return { lead: "b", follow: "a" }
  }
}

const getPathFromPoints = (points: Vector3[]): string => {
  console.debug("  - getPathFromPoints", points)
  return `${points.reduce((path, point) => `${path}L ${point.x} ${point.y}`,`M ${points[0].x} ${points[0].y}`)} z`
}

// Utilities

export const round = (n: number) => {
  return Math.round(n * 100) / 100
}
export const printPoint = (v: Vector3) => `(${round(v.x)}, ${round(v.y)})`

export const printTriangle = (tri: Triangle) =>
  `
    a (${round(tri.a.x)}, ${round(tri.a.y)}, ${round(tri.a.z)}) 
    b (${round(tri.b.x)}, ${round(tri.b.y)}, ${round(tri.b.z)})
    c (${round(tri.c.x)}, ${round(tri.c.y)}, ${round(tri.c.z)})`
