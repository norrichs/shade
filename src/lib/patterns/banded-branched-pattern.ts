import { isLinePathSegment, type Quadrilateral, type DynamicPathCollection, type DynamicPath, type PathSegment, isMovePathSegment } from "$lib/types";
import type { Point } from "bezier-js";
import { svgPathStringFromSegments } from "./flower-of-life";
import { getDirection, getLength, getMidPoint, getQuadWidth } from "./utils";

export const generateBranched = (
  quadBand: Quadrilateral[],
  config: { rows: number; columns: number; variant: number; minWidth?: number; maxWidth?: number }
): DynamicPathCollection => {
  const { rows, columns, variant } = config;
  const minWidth = config.maxWidth || 1;
  const maxWidth = config.maxWidth || 2;
  const outlineWidth = maxWidth;

  const getOutline = (): DynamicPath => {
    const left: PathSegment[][] = [];
    const right: PathSegment[][] = [];

    quadBand.forEach((quad, i) => {
      if (i === 0) {
        left.push([
          ['M', quad.p2.x, quad.p2.y],
          ['L', quad.p1.x, quad.p1.y],
          ['L', quad.p0.x, quad.p0.y],
          ['L', quad.p3.x, quad.p3.y]
        ]);
      } else if (i === quadBand.length - 1) {
        right.push([
          ['M', quad.p0.x, quad.p0.y],
          ['L', quad.p3.x, quad.p3.y],
          ['L', quad.p2.x, quad.p2.y],
          ['L', quad.p1.x, quad.p1.y]
        ]);
      } else {
        left.push([
          ['M', quad.p0.x, quad.p0.y],
          ['L', quad.p3.x, quad.p3.y]
        ]);
        right.push([
          ['M', quad.p2.x, quad.p2.y],
          ['L', quad.p1.x, quad.p1.y]
        ]);
      }
    });
    return [...left, ...right.reverse()].map((path) => {
      return { path, svgPath: '', width: maxWidth };
    });
  };

  const outline: DynamicPath = getOutline();

  const stubbyOutline = outline.map((section, i) => {
    if (
      section.path.length === 2 &&
      isMovePathSegment(section.path[0]) &&
      isLinePathSegment(section.path[1])
    ) {
      const { p0, p1 } = shortenLine(
        { x: section.path[0][1], y: section.path[0][2] },
        { x: section.path[1][1], y: section.path[1][2] },
        section.width / 2
      );
      const path: PathSegment[] = [
        ['M', p0.x, p0.y],
        ['L', p1.x, p1.y]
      ];
      return {
        ...section,
        path,
        svgPath: svgPathStringFromSegments(path)
      };
    } else if (
      section.path.length === 4 &&
      isMovePathSegment(section.path[0]) &&
      isLinePathSegment(section.path[1]) &&
      isLinePathSegment(section.path[2]) &&
      isLinePathSegment(section.path[3])
    ) {
      const sec0 = shortenLine(
        { x: section.path[0][1], y: section.path[0][2] },
        { x: section.path[1][1], y: section.path[1][2] },
        section.width / 2
      );
      const sec1 = shortenLine(
        { x: section.path[2][1], y: section.path[2][2] },
        { x: section.path[3][1], y: section.path[3][2] },
        section.width / 2
      );
      const path: PathSegment[] = [
        ['M', sec0.p0.x, sec0.p0.y],
        section.path[1],
        section.path[2],
        ['L', sec1.p1.x, sec1.p1.y]
      ];
      return { ...section, path, svgPath: svgPathStringFromSegments(path) };
    }
    return { ...section, svgPath: svgPathStringFromSegments(section.path) };
  });
  const outlineShape: DynamicPath = [
    {
      width: outline[0].width,
      path: [],
      svgPath: ''
    }
  ];
  outline.forEach((dPath, i) => {
    if (i === 0) {
      outlineShape[0].path.push(...dPath.path);
    } else {
      outlineShape[0].path.push(...dPath.path.slice(1));
    }
    outlineShape[0].svgPath = svgPathStringFromSegments(outlineShape[0].path);
  });
  const midPoints: { point: Point; quadWidth: number }[] = [];
  quadBand.forEach((quad, i) => {
    if (i === 0) {
      midPoints.push({ point: getMidPoint(quad.p0, quad.p1), quadWidth: 0 });
    }
    midPoints.push({ point: getMidPoint(quad.p2, quad.p3), quadWidth: getQuadWidth(quad) });
  });
  const minQuadWidth = Math.min(...midPoints.map((mp) => mp.quadWidth));
  const maxQuadWidth = Math.max(...midPoints.map((mp) => mp.quadWidth));
  const midLine: DynamicPath = [];
  midPoints.forEach((facet, i, facets) => {
    if (i > 0) {
      midLine.push({
        path: [
          ['M', facets[i - 1].point.x, facets[i - 1].point.y],
          ['L', facet.point.x, facet.point.y]
        ],
        width:
          ((facet.quadWidth - minQuadWidth) / (maxQuadWidth - minQuadWidth)) * maxWidth + minWidth,
        svgPath: svgPathStringFromSegments([
          ['M', facets[i - 1].point.x, facets[i - 1].point.y],
          ['L', facet.point.x, facet.point.y]
        ])
      });
    }
  });

  const branches = midLine.map((midlineSegment, i) => {
    const branch = { ...midlineSegment };
    branch.path = [
      branch.path[0],
      ['L', quadBand[i].p3.x, quadBand[i].p3.y],
      branch.path[0],
      ['L', quadBand[i].p2.x, quadBand[i].p2.y]
    ];
    branch.svgPath = svgPathStringFromSegments(branch.path);
    branch.width = branch.width / 4;
    return branch;
  });

  return { outline: stubbyOutline, outlineShape, midLine, branches };
};

const shortenLine = (p0: Point, p1: Point, remove: number): { p0: Point; p1: Point } => {
	const lineLength = getLength(p0, p1);
	const newHalfLength = lineLength / 2 - remove;
	const mid = getMidPoint(p0, p1);

	if (lineLength <= remove * 2) {
		return { p0: mid, p1: mid };
	}
	const diff: Point = { x: p1.x - p0.x, y: p1.y - p0.y };
	// const dir = diff.x >= 0 && diff.y >= 0 ? 1 : -1;

	let shortened;

	if (diff.x === 0) {
		shortened = {
			p0: { x: mid.x, y: mid.y - newHalfLength },
			p1: { x: mid.x, y: mid.y + newHalfLength }
		};
	} else if (diff.y === 0) {
		shortened = {
			p0: { x: mid.x - newHalfLength, y: mid.y },
			p1: { x: mid.x - newHalfLength, y: mid.y }
		};
	} else {
		const yxRatio = diff.y / diff.x;
		const x = newHalfLength / Math.sqrt(1 + yxRatio ** 2);
		const newHalfDiff: Point = { x, y: x * yxRatio };

		shortened = {
			p0: { x: mid.x - newHalfDiff.x, y: mid.y - newHalfDiff.y },
			p1: { x: mid.x + newHalfDiff.x, y: mid.y + newHalfDiff.y }
		};
	}

	const originalDirection = getDirection(p0, p1);
	const shortenedDirection = getDirection(shortened.p0, shortened.p1);
	if (originalDirection !== shortenedDirection) {
		shortened = { p0: shortened.p1, p1: shortened.p0 };
	}

	return shortened;
	// a^2 + b^2 = c^2
	// a^2 + (a * ratio)^2 = c^2
	// a^2 + ratio^2 * a^2 = c^2
	// (1+ratio^2)^.5 * a = c
	// a = c / (1+ratio^2)^.5
	// b = a * ratio
};
