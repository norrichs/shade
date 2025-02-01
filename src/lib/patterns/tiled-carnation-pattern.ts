import type { PathSegment, PatternedPattern, MovePathSegment } from "$lib/types";
import { transformPatternByQuad } from "./quadrilateral";
import { translatePS, getAngle, rotatePoint } from "./utils";

export const generateCarnation = ({
  size = 1,
  variant = 0,
  rows = 1,
  columns = 1
}: {
  size: number;
  rows: number;
  columns: number;
  variant: 0 | 1;
}): PathSegment[] => {
  const row = size / rows;
  const col = size / columns;
  const w = col / 4;
  const h = row / 2;

  let unitPattern: PathSegment[];
  if (variant === 1) {
    unitPattern = [
      ['M', 0, h],
      ['C', 0, h - h / 2, w, h, w, 0],
      ['C', w, h, 2 * w, h / 2, 2 * w, h],
      ['C', 2 * w, h / 2, 3 * w, h, 3 * w, 0],
      ['C', 3 * w, h, col, h / 2, col, h],
      ['M', 0, h],
      ['C', 0, row, w, row - h / 2, w, row],
      ['C', w, row - h / 2, 2 * w, row, 2 * w, h],
      ['C', 2 * w, row, 3 * w, row - h / 2, 3 * w, row],
      ['C', 3 * w, row - h / 2, col, row, col, h]
    ];
  } else {
    unitPattern = [
      ['M', 0, h],
      ['Q', w, h, w, 0],
      ['Q', w, h, 2 * w, h],
      ['Q', 3 * w, h, 3 * w, 0],
      ['Q', 3 * w, h, col, h],
      ['M', 0, h],
      ['Q', 0, row, w, row],
      ['Q', 2 * w, row, 2 * w, h],
      ['Q', 2 * w, row, 3 * w, row],
      ['Q', col, row, col, h]
    ];
  }
  const patternSegments: PathSegment[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      patternSegments.push(...translatePS(unitPattern, col * c, row * r));
    }
  }

  return patternSegments;
};

export const adjustCarnation = (tiledBands: { facets: PatternedPattern[] }[]) => {
  const patternPrototype = generateCarnation({ variant: 1, size: 1, rows: 1, columns: 1 });
  const addendaPrototype = [
    ['M', patternPrototype[3][5], patternPrototype[3][6]] as MovePathSegment,
    patternPrototype[4],
    ['M', patternPrototype[8][5], patternPrototype[8][6]] as MovePathSegment,
    patternPrototype[9]
  ];
  const adjusted = tiledBands.map((band, bandIndex, bands) => ({
    ...band,
    facets: band.facets.map((facet, facetIndex) => {
      const addendaFacet0 = window.structuredClone(
        bands[(bandIndex + bands.length - 1) % bands.length].facets[facetIndex]
      );

      if (facet.quad && addendaFacet0.quad) {
        const offset = {
          x: facet.quad.p0.x - addendaFacet0.quad.p1.x,
          y: facet.quad?.p0.y - addendaFacet0.quad?.p1.y
        };
        const offsetAngle =
          getAngle(facet.quad.p0, facet.quad.p3) -
          getAngle(addendaFacet0.quad.p1, addendaFacet0.quad.p2);
        const anchorPoint = {
          x: addendaFacet0.quad.p1.x + offset.x,
          y: addendaFacet0.quad.p1.y + offset.y
        };
        addendaFacet0.quad = {
          p0: rotatePoint(
            anchorPoint,
            { x: addendaFacet0.quad.p0.x + offset.x, y: addendaFacet0.quad.p0.y + offset.y },
            offsetAngle
          ),
          p1: anchorPoint,
          p2: rotatePoint(
            anchorPoint,
            { x: addendaFacet0.quad.p2.x + offset.x, y: addendaFacet0.quad.p2.y + offset.y },
            offsetAngle
          ),
          p3: rotatePoint(
            anchorPoint,
            { x: addendaFacet0.quad.p3.x + offset.x, y: addendaFacet0.quad.p3.y + offset.y },
            offsetAngle
          )
        };
      }

      // addendaPath0 =
      const addenda0 = {
        quad: addendaFacet0.quad,
        quadWidth: addendaFacet0.quadWidth,
        path: transformPatternByQuad(addendaPrototype, addendaFacet0.quad)
      };
      // const addendaFacet1 = bands[(bandIndex + bands.length + 1) % bands.length].facets[facetIndex];
      // const addenda1 = {
      // 	quad: addendaFacet1.quad,
      // 	quadWidth: addendaFacet1.quadWidth,
      // 	path: addendaFacet1.path
      // };

      return { ...facet, addenda: [addenda0] };
    })
  }));
  return adjusted;
};
