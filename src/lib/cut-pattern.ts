import { Vector2, Vector3, Triangle } from 'three';
import type {
  Band,
  BandStyle,
  Facet,
  TabStyle,
  RotatedShapeLevel,
  Strut,
  Strip
} from './rotated-shape';
import {
  generateMultiFacetFullTab,
  generateFullTab,
  generateTrapTab,
  isFullTab,
  isTrapTab,
  isMultiFacetFullTab,
  isMultiFacetTrapTab,
  isStrut
} from './rotated-shape';

export type PatternViewConfig = {
  width: number;
  height: number;
  zoom: number;
  centerOffset: {
    x: number;
    y: number;
  };
};
// export type ProjectionType = 'faceted' | 'outlined';
// type LevelPatternConfig = {
// 	patternType: 'levels';
// 	projectionType: 'outlined';
// };
// export const isLevelPatternConfig = (config: PatternConfig): config is LevelPatternConfig =>
// 	config.showPattern.level !== 'none';

type PatternStyle = 'faceted' | 'outlined' | 'none';

type PatternShowConfig = {
  [key: string]: PatternStyle;
  band: PatternStyle;
  strut: PatternStyle;
  level: PatternStyle;
};
export type PatternConfig = {
  showPattern: PatternShowConfig;
  axis: Axis;
  origin: Vector3;
  direction: Vector3;
  offset: Vector3;
  showTabs: boolean;
};
// | {
// 		patternType: 'strip';
// 		projectionType: 'outlined';
// 		axis: Axis;
// 		origin: Vector3;
// 		direction: Vector3;
// 		offset: Vector3;
// 		showTabs: boolean;
//   }
// | LevelPatternConfig;

export type FacetPattern = {
  svgPath: string;
  triangle: Triangle;
  tab?: FullTabPattern | TrapTabPattern | MultiFacetFullTabPattern | MultiFacetTrapTabPattern;
};

type FullTabPattern = {
  style: 'full';
  svgPath: string;
  triangle: Triangle;
};

type TrapTabPattern = {
  style: 'trapezoid';
  svgPath: string;
  triangle: Triangle;
};

type MultiFacetTrapTabPattern = {
  style: 'multi-facet-trapezoid';
  svgPath: string;
  triangle1: Triangle;
  triangle2: Triangle;
};
type MultiFacetFullTabPattern = {
  style: 'multi-facet-full';
  svgPath: string;
  triangle1: Triangle;
  triangle2: Triangle;
};

export type OutlinePattern = {
  tab?: {
    style: TabStyle['style'];
  };
  outline: {
    svgPath: string;
    points: Vector3[];
  };
  scoring?: (
    | {
      svgPath: string;
      points: Vector3[];
    }
    | undefined
  )[];
  cutouts?: {
    svgPath: string;
    points: Vector3[];
  };
};

export type LevelPattern = {
  outline: {
    svgPath: string;
    points: Vector2[];
  };
};

export type Pattern = FacetedBandPattern | OutlinedBandPattern | LevelSetPattern;

export type FacetedBandPattern = { projectionType: 'faceted'; bands: { facets: FacetPattern[] }[] };
export type OutlinedBandPattern = { projectionType: 'outlined'; bands: OutlinePattern[] };
export type LevelSetPattern = { projectionType: 'outlined'; levels: LevelPattern[] };
export type FacetedStrutPattern = {
  projectionType: 'faceted';
  struts: { facets: FacetPattern[] }[];
};
export type OutlinedStrutPattern = { projectionType: 'outlined'; struts: OutlinePattern[] };

type Axis = 'z' | 'x' | 'y';

export type TrianglePoint = 'a' | 'b' | 'c';
export type TriangleSide = 'ab' | 'ac' | 'bc';

type AlignTrianglesConfig = {
  isEven: boolean;
  isTabOnGreaterSide: boolean;
  lead: {
    vec: Vector3;
    p: TrianglePoint;
  }; // front point of prevTriangle to be aligned against
  follow: {
    vec: Vector3;
    p: TrianglePoint;
  }; // back point of prevTriangle to be aligned against
};
type FlatStripConfig = {
  bandStyle: BandStyle;
  origin?: Vector3;
  direction?: Vector3;
};

const orderedPointsList = (points: { [key: string]: Vector3 }) => {
  return Object.entries(points)
    .sort((a, b) => {
      if (a[0] < b[0]) return 1;
      if (a[0] > b[0]) return -1;
      return 0;
    })
    .map((entry) => entry[1]);
};

const orderByTabStyle = (style: TabStyle['style'], isEven: boolean, points: Vector3[]) => {
  if (style.startsWith('multi-facet')) {
    return isEven ? points.reverse() : points;
  } else if (style === 'full') {
    return isEven ? points : points.reverse();
  }
  return points;
};

const getOutlinePoints = (strip: Strip, bandStyle: BandStyle): Vector3[] => {
  const points: Vector3[] = [];
  if (bandStyle === 'circumference' || bandStyle === 'helical-right') {
    // top edges
    let { lead, follow } = generateEdgeConfig(bandStyle, false, isStrut(strip), true);

    for (let i = 1; i < strip.facets.length; i += 2) {
      const facet = strip.facets[i];
      points.push(facet.triangle[follow]);
      if (facet.tab) {
        points.push(
          ...orderByTabStyle(facet.tab.style, i % 2 === 0, orderedPointsList(facet.tab.outer))
        );
      }
    }

    points.push(strip.facets[strip.facets.length - 1].triangle[lead]);
    const swap = lead;
    lead = follow;
    follow = swap;

    for (let i = strip.facets.length - 2; i >= 0; i -= 2) {
      const facet = strip.facets[i];
      points.push(facet.triangle[lead]);
      if (facet.tab) {
        points.push(
          ...orderByTabStyle(facet.tab.style, i % 2 === 0, orderedPointsList(facet.tab.outer))
        );
      }
    }

    points.push(strip.facets[0].triangle[follow]);
  }

  return points;
};

export const generateStrutPatterns = (
  config: PatternConfig,
  struts: Strut[]
): FacetedStrutPattern | OutlinedStrutPattern => {
  if (config.showPattern.strut === 'none') throw new Error('Strut patterns not configured');
  const tiling = struts[0].tiling;
  if (!struts.every((strut) => strut.tiling === tiling))
    throw new Error('tiling property inconsistent');

  const flattenedGeometry: Strut[] = struts.map((strut, i) => {
    return getFlatStrip(strut, {
      bandStyle: strut.tiling,
      origin: config.origin.clone().addScaledVector(config.offset, i),
      direction: config.direction
    });
  });

  if (config.showPattern.strut === 'faceted') {
    const facetedPattern: FacetedStrutPattern = {
      projectionType: 'faceted',
      struts: flattenedGeometry.map((flatStrut) => {
        const strutPattern = {
          ...flatStrut,
          facets: flatStrut.facets.map((facet) => {
            const pattern: FacetPattern = {
              svgPath: getPathFromPoints([facet.triangle.a, facet.triangle.b, facet.triangle.c]),
              triangle: facet.triangle.clone()
            };
            return pattern;
          })
        };
        return strutPattern;
      })
    };
    return facetedPattern;
  }

  const outlinedPattern: OutlinedStrutPattern = {
    projectionType: 'outlined',
    struts: flattenedGeometry.map((flatStrut) => {
      const outline: Vector3[] = getOutlinePoints(flatStrut, tiling);
      const pattern: OutlinePattern = {
        outline: {
          points: outline,
          svgPath: getPathFromPoints(outline)
        }
      };
      return pattern;
    })
  };
  return outlinedPattern;
};

export const generateBandPatterns = (
  config: PatternConfig,
  bandStyle: BandStyle,
  tabStyle: TabStyle,
  bands: Band[]
): FacetedBandPattern | OutlinedBandPattern => {
  if (config.showPattern.band === 'none') throw new Error('Band patterns not configured');
  const flattenedGeometry: Band[] = bands.map((band, i) =>
    getFlatStrip(
      band,
      {
        bandStyle: bandStyle,
        origin: config.origin.clone().addScaledVector(config.offset, i),
        direction: config.direction
      },
      tabStyle
    )
  );

  if (config.showPattern.band === 'faceted') {
    const facetedPattern: FacetedBandPattern = {
      projectionType: 'faceted',
      bands: flattenedGeometry.map((flatBand) => {
        const bandPattern = {
          ...flatBand,
          facets: flatBand.facets.map((facet) => {
            const pattern: FacetPattern = {
              svgPath: getPathFromPoints([facet.triangle.a, facet.triangle.b, facet.triangle.c]),
              triangle: facet.triangle.clone()
            };
            const tab = generateFacetTabPattern(facet.tab);
            if (tab) {
              pattern.tab = tab;
            }
            return pattern;
          })
        };
        return bandPattern;
      })
    };
    return facetedPattern;
  } else {
    const outlinedPattern: OutlinedBandPattern = {
      projectionType: 'outlined',
      bands: flattenedGeometry.map((flatBand) => {
        const outline: Vector3[] = getOutlinePoints(flatBand, bandStyle);
        const pattern: OutlinePattern = {
          outline: {
            points: outline,
            svgPath: getPathFromPoints(outline)
          }
        };
        // if (tabStyle.scored) {
        // 	pattern.scoring = flatBand.facets.map((facet) => {
        // 		return facet.tab?.scored
        // 			? {
        // 					points: [facet.tab.scored.a, facet.tab?.scored.b],
        // 					svgPath: getPathFromPoints([facet.tab.scored.a, facet.tab?.scored.b])
        // 			  }
        // 			: undefined;
        // 	});
        // }
        return pattern;
      })
    };
    return outlinedPattern;
  }
};

const generateFacetTabPattern = (facetTab: test | test[] | undefined) => {
  if (isFullTab(facetTab)) {
    return {
      style: 'full',
      svgPath: getPathFromPoints(orderedPointsList(facetTab.outer)),
      triangle: facetTab.footprint.triangle.clone()
    } as FullTabPattern;
  }
  if (isTrapTab(facetTab)) {
    return {
      style: 'trapezoid',
      svgPath: getPathFromPoints(orderedPointsList(facetTab.outer)),
      triangle: facetTab.footprint.triangle.clone()
    } as TrapTabPattern;
  }
  if (isMultiFacetFullTab(facetTab)) {
    return {
      style: 'multi-facet-full',
      svgPath: getPathFromPoints(orderedPointsList(facetTab.outer)),
      triangle1: facetTab.footprint[0].triangle.clone(),
      triangle2: facetTab.footprint[1].triangle.clone()
    } as MultiFacetFullTabPattern;
  }
  if (isMultiFacetTrapTab(facetTab)) {
    return {
      style: 'multi-facet-trapezoid',
      svgPath: getPathFromPoints(orderedPointsList(facetTab.outer)),
      triangle1: facetTab.footprint[0].triangle.clone(),
      triangle2: facetTab.footprint[1].triangle.clone()
    } as MultiFacetTrapTabPattern;
  }
};

export const generateLevelSetPatterns = (
  levels: RotatedShapeLevel[],
  config: PatternConfig
): LevelSetPattern => {
  if (config.showPattern.level === 'none') throw new Error('Level patterns not configured');
  const pattern: LevelSetPattern = { projectionType: 'outlined', levels: [] };

  const axis = new Vector2(0, 1);
  const center = new Vector2(0, 0);
  pattern.levels = levels.map((level) => {
    const primeVertex: Vector3 = level.vertices[0].clone().addScaledVector(level.center, -1);
    const levelPattern: LevelPattern = { outline: { svgPath: '', points: [] } };

    levelPattern.outline.points = level.vertices.map((vertex) => {
      const relativeVertex = vertex.clone().addScaledVector(level.center, -1);
      const cp = primeVertex.clone().cross(relativeVertex);
      let a = primeVertex.angleTo(relativeVertex);
      a = cp.z >= 0 ? a : Math.PI * 2 - a;
      const r = getLength(level.center, vertex);
      const patternVertex: Vector2 = axis.clone().setLength(r).rotateAround(center, a);
      return patternVertex;
    });

    levelPattern.outline.svgPath = getPathFromPoints(levelPattern.outline.points);
    return levelPattern;
  });
  return pattern;
};

const getLength = (p0: Vector3, p1: Vector3): number => {
  return p0.clone().addScaledVector(p1, -1).length();
};

const alignTriangle = (triangle: Triangle, config: AlignTrianglesConfig): Triangle => {
  // for odd facets (which should also be Greater Side), reverse the lead / follow vectors, and the angle?

  const parity = config.isEven ? 1 : -1;
  const tabParity = config.isTabOnGreaterSide ? -1 : 1;
  const zAxis = new Vector3(0, 0, 1);
  const pointSet: TrianglePoint[] = ['a', 'b', 'c'];

  const pivot = config.lead.p; // pivot is the same point as prevTriangle[config.follow], but has the same label as config.lead
  const constrained = config.follow.p;
  const free: TrianglePoint = pointSet.find((p) => p !== constrained && p !== pivot) || 'a';
  const segmentOldPivotFree = triangle[pivot].clone().addScaledVector(triangle[free], -1);
  const segmentOldPivotConstrained = triangle[pivot]
    .clone()
    .addScaledVector(triangle[constrained], -1);
  const len = segmentOldPivotFree.length();
  const angle = segmentOldPivotConstrained.angleTo(segmentOldPivotFree);

  const alignedTriangle = new Triangle();
  alignedTriangle[pivot] = config.isTabOnGreaterSide
    ? config.lead.vec.clone()
    : config.follow.vec.clone();
  alignedTriangle[constrained] = config.isTabOnGreaterSide
    ? config.follow.vec.clone()
    : config.lead.vec.clone();
  const segment = alignedTriangle[constrained]
    .clone()
    .addScaledVector(alignedTriangle[pivot], -1)
    .setLength(len)
    .applyAxisAngle(zAxis, angle * parity * tabParity);
  alignedTriangle[free] = segment.addScaledVector(alignedTriangle[pivot], 1);

  return alignedTriangle;
};

const getFirstTriangleParity = (bandStyle: BandStyle): boolean => {
  if (bandStyle === 'helical-right') return false;
  if (bandStyle === 'helical-left') return true;
  return true;
};

const getFlatStrip = <T extends Strut | Band>(
  strip: T,
  flatStripConfig: FlatStripConfig,
  tabStyle?: TabStyle
): T => {
  const config = {
    axis: new Vector3(0, 0, 1),
    origin: new Vector3(0, 0, 0),
    direction: new Vector3(0, -1, 0),
    ...flatStripConfig
  };

  const flatStrip: Strip = { ...strip, facets: [] };
  strip.facets.forEach((facet, i) => {
    const alignedFacet: Facet = { ...facet };

    // let edgeConfig
    let edgeConfig = generateEdgeConfig(flatStripConfig.bandStyle, Math.abs((i - 1) % 2) == 0, isStrut(strip), false);
    let alignConfig: AlignTrianglesConfig;

    if (i === 0) {
      const firstAlignedPoints: { pivot: TrianglePoint; constrained: TrianglePoint } = !isStrut(strip)
        ? { pivot: 'a', constrained: 'c' }
        : { pivot: 'c', constrained: 'a' };
      const firstLength = getLength(
        facet.triangle[firstAlignedPoints.pivot],
        facet.triangle[firstAlignedPoints.constrained]
      );
      alignConfig = {
        isEven: getFirstTriangleParity(flatStripConfig.bandStyle),
        isTabOnGreaterSide: false,
        lead: {
          p: firstAlignedPoints.constrained,
          vec: config.direction.clone().setLength(firstLength).addScaledVector(config.origin, 1)
        },
        follow: { p: firstAlignedPoints.pivot, vec: config.origin.clone() }
      };
    } else {
      const prevFlatTriangle = flatStrip.facets[i - 1].triangle;
      alignConfig = {
        isEven: Math.abs((i - 1) % 2) === 0,
        isTabOnGreaterSide: false,
        lead: { p: edgeConfig.lead, vec: prevFlatTriangle[edgeConfig.lead].clone() },
        follow: { p: edgeConfig.follow, vec: prevFlatTriangle[edgeConfig.follow].clone() }
      };
    }
    alignedFacet.triangle = alignTriangle(facet.triangle, alignConfig);

    if (facet.tab && tabStyle) {
      edgeConfig = generateEdgeConfig(config.bandStyle, i % 2 === 0, false, true);
      const tabAlignConfig = {
        isEven: Math.abs((i - 1) % 2) === 0,
        isTabOnGreaterSide: Math.abs((i - 1) % 2) === 1,
        lead: { p: edgeConfig.lead, vec: alignedFacet.triangle[edgeConfig.lead].clone() },
        follow: { p: edgeConfig.follow, vec: alignedFacet.triangle[edgeConfig.follow].clone() }
      };
      if (facet.tab.style === 'full' || facet.tab.style === 'trapezoid') {
        const tabFootprint = alignTriangle(facet.tab.footprint.triangle, tabAlignConfig);

        if (tabStyle?.style === 'full') {
          alignedFacet.tab = generateFullTab(tabStyle, tabFootprint, edgeConfig);
        } else if (tabStyle?.style === 'trapezoid') {
          alignedFacet.tab = generateTrapTab(tabStyle, tabFootprint, edgeConfig);
        }
      } else if (facet.tab?.style.startsWith('multi-facet')) {
        if (facet.tab.style === 'multi-facet-full') {
          const edgeConfig0 = generateEdgeConfig(config.bandStyle, i % 2 === 0, false, true);
          const alignConfig0: AlignTrianglesConfig = {
            isEven: i % 2 === 0,
            isTabOnGreaterSide: i % 2 === 1,
            lead: { vec: alignedFacet.triangle[edgeConfig0.follow], p: edgeConfig0.follow },
            follow: { vec: alignedFacet.triangle[edgeConfig0.lead], p: edgeConfig0.lead }
          };
          const tabTriangle0: Triangle = alignTriangle(
            facet.tab.footprint[0].triangle,
            alignConfig0
          );
          // Configure second triangle of tab
          const edgeConfig1 =
            i % 2 === 0
              ? generateEdgeConfig(config.bandStyle, i % 2 !== 0, false, false)
              : ({ lead: 'b', follow: 'a' } as EdgeConfig);
          const alignConfig1: AlignTrianglesConfig = {
            isEven: false,
            isTabOnGreaterSide: false,
            lead: { vec: tabTriangle0[edgeConfig1.lead], p: edgeConfig1.lead },
            follow: { vec: tabTriangle0[edgeConfig1.follow], p: edgeConfig1.follow }
          };
          const tabTriangle1: Triangle = alignTriangle(
            facet.tab.footprint[1].triangle,
            alignConfig1
          );

          alignedFacet.tab = generateMultiFacetFullTab(
            {
              ...facet.tab.footprint[0],
              triangle: tabTriangle0
            },
            {
              ...facet.tab.footprint[1],
              triangle: tabTriangle1
            },
            generateEdgeConfig(flatStripConfig.bandStyle, i % 2 === 0, false, true),
            i % 2 === 0 ? 'lesser' : 'greater',
            tabStyle
          );
        }
      }

      // alignedFacet.tab = {
      //   ...facet.tab,
      //   footprint: {
      //     ...facet.tab.footprint,
      //     triangle: tabFootprint
      //   }
      // }
    }
    flatStrip.facets.push(alignedFacet);
  });

  return flatStrip as T;
};

// Looks up the edge configuration for a given triangle
// "lead" is defined as:
//  the forwardmost vertex of a pair of vertices on the edge of the strip
// "follow" is defined as:
//    when the edge is conjoined with another strip triangle, the "single" vertex on the strip edge
//    when the edge is conjoined with a tab, the rearmost of the pair of vertices

export type EdgeConfig = { lead: TrianglePoint; follow: TrianglePoint };

export const generateEdgeConfig = (
  bandStyle: BandStyle,
  isEven: boolean,
  isStrut: boolean,
  isTabEdge: boolean,
): EdgeConfig => {
  if (isStrut) {
    if (bandStyle === 'helical-right') {
      if (isEven) return { lead: 'a', follow: 'b' };
      else return { lead: 'c', follow: 'b' }
      // else if (isEven && !isTabEdge) return { lead: 'c', follow: 'b' };
      // else if (!isEven && isTabEdge) return { lead: 'a', follow: 'c' };
      // else return { lead: 'a', follow: 'b' };
    } else throw new Error("Only helical-right struts supported")
  } else {
    if (bandStyle === 'circumference') {
      if (isEven && isTabEdge) return { lead: 'b', follow: 'a' };
      else if (isEven && !isTabEdge) return { lead: 'b', follow: 'c' };
      else if (!isEven && isTabEdge) return { lead: 'a', follow: 'b' };
      else return { lead: 'a', follow: 'c' };
    } else if (bandStyle === 'helical-right') {
      if (isEven && isTabEdge) return { lead: 'c', follow: 'a' };
      else if (isEven && !isTabEdge) return { lead: 'c', follow: 'b' };
      else if (!isEven && isTabEdge) return { lead: 'a', follow: 'c' };
      else return { lead: 'a', follow: 'b' };
    } else {
      if (isEven && isTabEdge) return { lead: 'c', follow: 'b' };
      else if (isEven && !isTabEdge) return { lead: 'c', follow: 'a' };
      else if (!isEven && isTabEdge) return { lead: 'b', follow: 'c' };
      else return { lead: 'b', follow: 'a' };
    }
  }

};

function getPathFromPoints(points: (Vector3 | Vector2)[]): string {
  return `${points.reduce(
    (path, point) => `${path}L ${point.x} ${point.y}`,
    `M ${points[0].x} ${points[0].y}`
  )} z`;
}

// Utilities

export const round = (n: number) => {
  return Math.round(n * 100) / 100;
};
export const printPoint = (v: Vector3) => `(${round(v.x)}, ${round(v.y)})`;

export const printTriangle = (tri: Triangle) =>
  `
    a (${round(tri.a.x)}, ${round(tri.a.y)}, ${round(tri.a.z)})
    b (${round(tri.b.x)}, ${round(tri.b.y)}, ${round(tri.b.z)})
    c (${round(tri.c.x)}, ${round(tri.c.y)}, ${round(tri.c.z)})`;
