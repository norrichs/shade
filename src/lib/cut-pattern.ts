import { Vector3, Triangle, Plane } from "three"
import { degToRad } from "three/src/math/MathUtils"
import type { Band, RotatedShapeLevel, Validation } from "./rotated-shape"

export const alignTriangleToAxis = (triangle: Triangle, axis: Vector3 = new Vector3(0, 0, 1)) => {
  const relPoints = [
    new Vector3(0,0,0),
    new Vector3(0,0,0).addScaledVector(triangle.a.clone().addScaledVector(triangle.b, -1), -1),
    new Vector3(0,0,0).addScaledVector(triangle.a.clone().addScaledVector(triangle.c, -1), -1),
  ]
  const ortho = new Vector3().crossVectors(relPoints[1], relPoints[2])   // vector orthogonal to plane of triangle
  const rotational = new Vector3().crossVectors(ortho, axis).setLength(1)
  const angle = axis.angleTo(ortho) - Math.PI
  const flatTriangle = new Triangle(
    relPoints[0].clone(), 
    relPoints[1].clone().applyAxisAngle(rotational, angle),
    relPoints[2].clone().applyAxisAngle(rotational, angle)
  )
  return flatTriangle
}

const getPathFromTriangle = (triangle: Triangle): string => {
  const points = [triangle.a, triangle.b, triangle.c]
  return `${points.reduce((path, point, i, points) => `${path}L ${point.x} ${point.y}`,`M ${points[0].x} ${points[0].y}`)} z`
}

type Axis = "z" | "x" | "y"

const getAxis = (axisType: Axis) => {
  switch (axisType) {
    case "z":
      return new Vector3(0, 0, 1);
    case "x":
      return new Vector3(1, 0, 0);
    case "y":
      return new Vector3(0, 1, 0);
  }
}

export type PatternConfig = 
  | { projectionType: "projection" }
  | { projectionType: "flattened", axis: Axis, origin: Vector3, direction: Vector3 }
  | { projectionType: "outlined" }



export type BandPattern = 
  | { projectionType: "projection", bands: { facets: string[] }[] }
  | { projectionType: "flattened", bands: { facets: string[] }[] }
  | { projectionType: "outlined", bands: string[] }

export const generateBandPatterns = (config: PatternConfig, bands: Band[]): BandPattern => {
  let result: BandPattern
  switch (config.projectionType) {
    case "projection":
      result = {
        projectionType: "projection",
        bands: bands.map(band => ({ facets: band.facets.map(facet => getPathFromTriangle(facet.triangle)) }))
      }
      return result;
    case "flattened":
      return {
        projectionType: "flattened",
        bands: bands
          .map((band, i)=> ({
            facets: getFlatStrip(
              band,
              config.origin.clone().addScaledVector(config.direction, -i / 1.3),
              config.direction
            ).facets
              .map(facet => getPathFromTriangle(facet.triangle))
          }))
      }
    default:
      result = {
        projectionType: "projection",
        bands: bands.map(band => ({facets: band.facets.map(facet => getPathFromTriangle(facet.triangle))}))
      }
      return result
    
  }
}

const getFlatStrip = (band: Band, origin: Vector3 = new Vector3(0, 0, 0), originDirection: Vector3 = new Vector3(0, 1, 0)): Band => {
  const zAxis = getAxis("z")
  const flatStrip: Band = { facets: [] }
  band.facets.forEach((facet, i) => {
    const { triangle } = facet
    const CA = facet.triangle.a.clone().addScaledVector(triangle.c, -1)
    const CB = facet.triangle.b.clone().addScaledVector(triangle.c, -1)

    const lengthCA = CA.length()
    const lengthCB = CB.length()
    const angle = -CA.angleTo(CB)
    
    if (i === 0) {
      flatStrip.facets.push({
        ...facet,
        triangle: new Triangle(
          originDirection.clone().setLength(lengthCA).addScaledVector(origin, 1),
          originDirection.clone().setLength(lengthCB).applyAxisAngle(zAxis, angle).addScaledVector(origin, 1),
          origin.clone(),
        )
      })
    } else {
      const prev = flatStrip.facets[flatStrip.facets.length - 1].triangle
      const prevBC = prev.c.clone().addScaledVector(prev.b, -1)
      const prevAC = prev.c.clone().addScaledVector(prev.a, -1)
      if (i % 2 === 1) {
        flatStrip.facets.push({
          ...facet,
          triangle: new Triangle(
            prevBC.setLength(lengthCA).applyAxisAngle(new Vector3(0, 0, 1), -angle + degToRad(0)).addScaledVector(prev.b, 1),
            prev.c.clone(),
            prev.b.clone(),
          )
        })
      } else {
        flatStrip.facets.push({
          ...facet,
          triangle: new Triangle(
            prev.c.clone(),
            prevAC.setLength(lengthCB).applyAxisAngle(new Vector3(0, 0, 1), angle).addScaledVector(prev.a, 1),
            prev.a.clone(),
          )
        })
      }
    }
  })

  return flatStrip;
}



