import { CatmullRomCurve3, CurvePath, Vector3 } from 'three';
  
export type LevelVertex = { inner: Vector3; outer: Vector3; }
export type Level = { center: Vector3; vertices: LevelVertex[]; }

export type RingVertex = {left: LevelVertex; right: LevelVertex}
export type Ring = { center: Vector3; vertices: RingVertex[] }

export type Strut = {
		t0: Vector3[];
		t1: Vector3[];
		t2: Vector3[];
	}
export type StrutGroup = {
  angle: number;
  right: Strut;
  left: Strut;
}
export interface LevelConfig {
  r: number;
  w: number;
  offset: {
    x?: number;
    y?: number;
    z?: number;
    rotx?: number;
    roty?: number;
    rotz?: number;
  }
}

export interface RibbonGroup {
  left: Vector3[][],
  right: Vector3[][],
}
////////////
// Levels
////////////

const getLevels = (shadeConfig: LevelConfig[], sides: number): Level[] => {
  console.debug("getting levels")
  const baseAngle = Math.PI * 2 / sides;
  const unitVertex: LevelVertex = {inner: new Vector3(0, 1, 0), outer: new Vector3(0, 1, 0)} 

  const unitLevel: Level = { center: new Vector3(0, 0, 0), vertices: new Array(sides) }
  unitLevel.vertices.fill( unitVertex )
  unitLevel.vertices = unitLevel.vertices.map((vertex, i) => ({
    inner: vertex.inner.clone().applyAxisAngle(new Vector3(0,0,1), baseAngle * i),
    outer: vertex.outer.clone().applyAxisAngle(new Vector3(0,0,1), baseAngle * i),
  }))

  let levels: Level[] = new Array(shadeConfig.length)
  
  levels.fill(unitLevel)
  
  // clone unitLevel  vertices so each is a separate instance
  levels = levels.map(level => ({
    center: level.center.clone(), vertices: level.vertices.map(vertex => ({
      inner: vertex.inner.clone(),
      outer: vertex.outer.clone()
    }))
  }))
  
  // apply scaling and offsets to base vertices
  levels = levels.map((level, levelIndex) => {
    const lc = shadeConfig[levelIndex]
    const offset = new Vector3(lc.offset.x, lc.offset.y, lc.offset.z )
    const newLevel: Level = ({
      center: offset, vertices: level.vertices.map((vertex) => {
        return {
          inner: vertex.inner
            .setLength(lc.r - lc.w)
            .addScaledVector(offset, 1)
            .applyAxisAngle(new Vector3(0, 0, 1), (lc.offset.rotz || 0) + (levelIndex * baseAngle / 2))
            .applyAxisAngle(new Vector3(1, 0, 0), (lc.offset.rotx || 0))
            .applyAxisAngle(new Vector3(0, 1, 0), (lc.offset.roty || 0)),
          outer: vertex.outer
            .setLength(lc.r)
            .addScaledVector(offset, 1)
            .applyAxisAngle(new Vector3(0, 0, 1), (lc.offset.rotz || 0) + (levelIndex * baseAngle / 2))
            .applyAxisAngle(new Vector3(1, 0, 0), (lc.offset.rotx || 0))
            .applyAxisAngle(new Vector3(0, 1, 0), (lc.offset.roty || 0)),
        }
      })
    })
    return newLevel
  })
  
  // console.debug("getLevels", levels)
  return levels
}


///////////
// Rings
///////////

const getRings = (levels: Level[], sides: number, ringOffsetRatio: number): Ring[] => {
  console.debug("getting rings")

  let rings: Ring[] = new Array(levels.length - 1)
  rings.fill({
    center: new Vector3(0, 0, 0),
    vertices: new Array(sides).fill({ inner: new Vector3(), outer: new Vector3() })
  })
  rings = rings.map((ring, r) => ({center: ring.center.clone(), vertices: ring.vertices.map((vertex, v) => {
    // console.debug("ring", r, "vertex",`${v}/${sides}`)
    const l0: LevelVertex   = levels[r][v]
    const l1_R: LevelVertex = levels[r + 1][v]
    const l1_L: LevelVertex = levels[r + 1][(v + sides - 1) % (sides)]

    const ring_L: LevelVertex = {
      inner: l0.inner.clone().addScaledVector(l1_L.inner, -1),
      outer: l0.outer.clone().addScaledVector(l1_L.outer, -1)
    }    
    const ring_R: LevelVertex = {
      inner: l0.inner.clone().addScaledVector(l1_R.inner, -1),
      outer: l0.outer.clone().addScaledVector(l1_R.outer, -1)
    }
  
    return {
      left: {
        inner: l1_L.inner.clone().addScaledVector(ring_L.inner, ringOffsetRatio),
        outer: l1_L.outer.clone().addScaledVector(ring_L.outer, ringOffsetRatio)
      },
      right: {
        inner: l1_R.inner.clone().addScaledVector(ring_R.inner, ringOffsetRatio),
        outer: l1_R.outer.clone().addScaledVector(ring_R.outer, ringOffsetRatio)
      },
    }
  })})) 
  // console.debug("getRings", rings)
  return rings
}



//////////
// Struts
//////////
const getStruts = (levels: Level[], rings: Ring[], sides: number): StrutGroup[][] => {
  console.debug("getting struts")
  const baseAngle = Math.PI * 2 / sides
  const emptyStrut: StrutGroup = {
    angle: 0,
    left: {
      t0: [],
      t1: [],
      t2: []
    },
    right: {
      t0: [],
      t1: [],
      t2: []
    },
  
  }
  const emptyStrutLevel: StrutGroup[] = new Array(sides)
  emptyStrutLevel.fill(emptyStrut)
  let struts: StrutGroup[][] = new Array(levels.length - 1)
  struts.fill(emptyStrutLevel)
  
  struts = struts.map((level, l) => (level.map((strut,s) => {
    const l0: LevelVertex = levels[l][s] // vertex of this level
    const l1_L: LevelVertex = levels[l + 1][(s - 1 + levels[l].length) % levels[l].length]  // vertex of the level above l0, 1/2 baseAngle to the left
    const l1_R: LevelVertex = levels[l + 1][s] // vertex of the level above l0, 1/2 baseAngle to the right
    const ring_L: LevelVertex = rings[l][s].left
    const ring_R: LevelVertex = rings[l][s].right
  
    const newStrut: StrutGroup = {
      angle: baseAngle * s,
      left: {
        t0: [l0.inner, l0.outer, ring_L.outer],
        t1: [l0.inner, ring_L.outer, l1_L.inner],
        t2: [ring_L.outer, l1_L.outer, l1_L.inner]
      },
      right: {
        t0: [l0.inner, l0.outer, ring_R.outer],
        t1: [l0.inner, ring_R.outer, l1_R.inner],
        t2: [ring_R.outer, l1_R.outer, l1_R.inner]
      }
    }
    return newStrut
  })))
  
  // console.debug("getStruts", struts)
  return struts

}

export const getSmoothStruts = (rings: Ring[], levels: Level[]): RibbonGroup[]=> {
  console.debug("getting smooth struts")
  const sides = levels[0].length
  let struts = new Array(1)
  struts.fill({})
  struts = struts.map((strut, i) => {
    // console.debug("strut", i, (sides - 1) - i, levels[0].length, levels[0][i], levels[0][(sides - 1) - i])
    const points = [{
      right: {
        inner: levels[0][i].inner.clone(),
        outer: levels[0][i].outer.clone(),
			},
      left: {
        inner: levels[0][(sides - 1) - i].inner.clone(),
        outer: levels[0][(sides - 1) - i].outer.clone(),
      }
    }]

    for (let j = 0; j < rings.length; j++) {
      const ring = rings[j]
      const level = levels[j + 1]
      // push 2 points to alternate ring and level for each
      points.push({
        right: {
          inner: ring[i].right.inner.clone(),
          outer: ring[i].right.outer.clone() 
        },
        left: {
          inner: ring[(sides - 1) - i].left.inner.clone(),
          outer: ring[(sides - 1) - i].left.outer.clone() 
        },
      },
      {
        right: {
          inner: level[i].inner.clone(),
          outer: level[i].outer.clone() 
        },
        left: {
          inner: level[(sides - 1) - i].inner.clone(),
          outer: level[(sides - 1) - i].outer.clone() 
        },
      })
    }
    // Add Extra points
    const prePoint = {
      left: {
        inner: points[0].left.inner.clone().addScaledVector(
          points[0].left.inner.clone().addScaledVector(points[1].left.inner, -1),
          1
        ),
        outer: points[0].left.outer.clone().addScaledVector(
          points[0].left.outer.clone().addScaledVector(points[1].left.outer, -1),
          1
        )
      },
      right: {
        inner: points[0].right.inner.clone().addScaledVector(
          points[0].right.inner.clone().addScaledVector(points[1].right.inner, -1),
          1
        ),
        outer: points[0].right.outer.clone().addScaledVector(
          points[0].right.outer.clone().addScaledVector(points[1].right.outer, -1),
          1
        )
      }
    }
    const last = points.length - 1
    const postPoint = {
      left: {
        inner: points[last].left.inner.clone().addScaledVector(
          points[last].left.inner.clone().addScaledVector(points[last - 1].left.inner, -1),
          1
        ),
        outer: points[last].left.outer.clone().addScaledVector(
          points[last].left.outer.clone().addScaledVector(points[last - 1].left.outer, -1),
          1
        )
      },
      right: {
        inner: points[last].right.inner.clone().addScaledVector(
          points[last].right.inner.clone().addScaledVector(points[last - 1].right.inner, -1),
          1
        ),
        outer: points[last].right.outer.clone().addScaledVector(
          points[last].right.outer.clone().addScaledVector(points[last - 1].right.outer, -1),
          1
        )
      }
    }

    points.unshift(prePoint)
    points.push(postPoint)

    interface SmoothStrutGroup<T> {
      left: {
        inner: T;
        outer: T;
      },
      right: {
        inner: T;
        outer: T;
      },
    }



    // const getCurves = (points: Vector3[]): CatmullRomCurve3[] => {
    //   const curves: CatmullRomCurve3[] = new Array(points.length - 3)
    //   for (let i = 0; i < curves.length; i++) {
    //     curves[i] = (new CatmullRomCurve3(points.slice(i, i + 4)))
    //   }
    //   return curves
    // }

    const getCurves = (points: Vector3[]): CurvePath<Vector3> => {
      const curves = new CurvePath<Vector3>()
      for (let i = 0; i < points.length - 3; i++) {
        curves.add(new CatmullRomCurve3(points.slice(i, i + 4)))
      }
      return curves
    }

    const curves: SmoothStrutGroup<CurvePath<Vector3>> = {
      left: {
        inner: getCurves(points.map(point => point.left.inner)),
        outer: getCurves(points.map(point => point.left.outer)),
      },
      right: {
        inner: getCurves(points.map(point => point.right.inner)),
        outer: getCurves(points.map(point => point.right.outer)),
      },
    }

    console.debug("curves",curves)
    
    const getSmoothStrutPoints = (curvePathGroup: {inner: CurvePath<Vector3>, outer: CurvePath<Vector3>}, divisionsByLength: number) => {
      const points: {inner: Vector3[]; outer: Vector3[]} = {inner: [], outer: []};

      curvePathGroup.outer.curves.forEach((curve, i) => {
        const divisions = curve.getLength() * divisionsByLength;
        const newPointsOuter = curve.getSpacedPoints(divisions)
        const newPointsInner = curvePathGroup.inner.curves[i].getSpacedPoints(divisions)

        if (newPointsOuter.length !== newPointsInner.length) {
          console.debug("--- unequal", newPointsOuter.length,  newPointsInner.length)
        }

        points.outer.push(...newPointsOuter)
        points.inner.push(...newPointsInner)
      })
      return points
    }

    const dBL = 5;
    // TODO - calculate devisions for inner and outer together
    const ribbonPoints: SmoothStrutGroup<Vector3[]> = {
      left: getSmoothStrutPoints(curves.left, dBL),
      right: getSmoothStrutPoints(curves.right, dBL)
    } 
    console.debug("ribbonPoints", ribbonPoints)
  
    const ribbon = {
					left: new Array(ribbonPoints.left.inner.length - 1),
					right: new Array(ribbonPoints.right.inner.length - 1),
				}
    const emptyTriangle: Vector3[] = new Array(3)
    ribbon.left.fill(emptyTriangle)
    ribbon.right.fill(emptyTriangle)



    const ribbonGroup: RibbonGroup = {
      left: ribbon.left.map((triangle, i) => {
        const result = [
          ribbonPoints.left.inner[i], 
          ribbonPoints.left.inner[i + 1], 
          ribbonPoints.left.outer[i + 1], 
          ribbonPoints.left.outer[i + 1], 
          ribbonPoints.left.outer[i], 
          ribbonPoints.left.inner[i]]
        return result
      }),
      right: ribbon.right.map((triangle, i) => {
        const result = [
          ribbonPoints.right.inner[i], 
          ribbonPoints.right.inner[i + 1], 
          ribbonPoints.right.outer[i + 1], 
          ribbonPoints.right.outer[i + 1], 
          ribbonPoints.right.outer[i], 
          ribbonPoints.right.inner[i]]
        return result
      }),
    }
    console.debug("ribbonGroup", ribbonGroup)
    
    return ribbonGroup
  })
  
  return struts
}

export const getShade = (
  shadeConfig: LevelConfig[], 
  sides: number, 
  ringOffsetRatio: number
): {levels: Level[], rings: Ring[], struts: StrutGroup[][], ribbons: RibbonGroup[]} => {
  const levels = getLevels(shadeConfig, sides)
  const rings = getRings(levels, sides, ringOffsetRatio)
  const struts = getStruts(levels, rings, sides)
  const ribbons = getSmoothStruts(rings, levels)

  console.debug("ribbons", ribbons)
  return { levels, rings, struts, ribbons }
}




export const isCoplanar = (relPoints: Vector3[], tolerance: number = Math.PI / 1000) => {
  // relPoints.shift() // remove first point
  // console.debug("isCoplanar? relPoints", relPoints)
  const planeAxis = new Vector3().crossVectors(relPoints[1], relPoints[2])
  const angle = relPoints[0].angleTo(planeAxis)
  for (const point of relPoints) {
    if (Math.abs(angle - point.angleTo(planeAxis)) > tolerance) {
      // console.debug("points are not coplanar - relPoints:",angle, tolerance, relPoints)
      return false
    } 
  }
  return true
}




export const alignPerpendicularToAxis = (points: Vector3[], axis: Vector3 = new Vector3(0, 0, 1)) => {
  // convert points to vectors relative to p0;
  // find center from levelConfig -> offset.x, offxet.y, offset.z
  console.debug("alignPerpA")
  const p0 = points[0]
  const relPoints: Vector3[] = []
  points.forEach((point, i) => {
    relPoints.push(new Vector3(0, 0, 0).addScaledVector(p0.clone().addScaledVector(point, -1), -1))
    console.debug("p0", p0, `point ${i}`, relPoints[i], points[i])
  })
  
  // console.debug("p0", p0, "relpoints", relPoints)

  // check if coplanar
  if (!isCoplanar(relPoints)) {
    console.error("points are not coplanar and cannot be realigned")
  }
  // get axes and angles to compare to
  const planeAxis = new Vector3().crossVectors(relPoints[1], relPoints[2])
  const rotationAxis = new Vector3().crossVectors(planeAxis, axis)
  const rotationAngle = planeAxis.angleTo(axis)

  // apply corrective rotation to all points
  return relPoints.map(point => point.applyAxisAngle(rotationAxis, rotationAngle))
}



// TODO - 
// create new flattening function that uses offsets as an argument  (problem: won't be generalizable for arbitrary geometry)
// create new 'strut' geometry that takes all the points defining a multilevel strut as definition for a Catmull Rom curve.
//    Output points and divide into triangles which can be flattened