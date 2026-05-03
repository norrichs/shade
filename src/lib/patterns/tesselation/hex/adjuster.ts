import type {
	BandCutPattern,
	PathSegment,
	Quadrilateral,
	TiledPatternConfig,
	TubeCutPattern
} from '$lib/types';
import type { Point } from '$lib/types';
import { getAngle, rotatePS, rotatePoint, translatePS } from '../../utils';
import { hexSegments, straightenEndSegments } from './helpers';

const translateQuad = (quad: Quadrilateral, x: number, y: number): Quadrilateral => ({
	a: quad.a.clone().add({ x, y, z: 0 } as any),
	b: quad.b.clone().add({ x, y, z: 0 } as any),
	c: quad.c.clone().add({ x, y, z: 0 } as any),
	d: quad.d.clone().add({ x, y, z: 0 } as any)
});

const rotateQuad = (quad: Quadrilateral, angle: number, anchor: Point): Quadrilateral => {
	const rp = (p: any) => rotatePoint(anchor, { x: p.x, y: p.y }, angle);
	return {
		a: { x: rp(quad.a).x, y: rp(quad.a).y, z: quad.a.z } as any,
		b: { x: rp(quad.b).x, y: rp(quad.b).y, z: quad.b.z } as any,
		c: { x: rp(quad.c).x, y: rp(quad.c).y, z: quad.c.z } as any,
		d: { x: rp(quad.d).x, y: rp(quad.d).y, z: quad.d.z } as any
	};
};

export const adjustHexTesselation = (
	bands: BandCutPattern[],
	tiledPatternConfig: TiledPatternConfig,
	_tubes: TubeCutPattern[]
): BandCutPattern[] => {
	return bands.map((band) => {
		let patternBand: PathSegment[][] = band.facets.map((f) => f.path);
		const quadBand: Quadrilateral[] = band.facets.map((f) => f.quad!);
		patternBand = adjustHexBand(patternBand, quadBand, tiledPatternConfig);
		return {
			...band,
			facets: band.facets.map((f, i) => ({ ...f, path: patternBand[i] }))
		};
	});
};

const adjustHexBand = (
	patternBand: PathSegment[][],
	quadBand: Quadrilateral[],
	tiledPatternConfig: TiledPatternConfig
): PathSegment[][] => {
	const { endsMatched, endsTrimmed, rowCount, columnCount, endLooped } = tiledPatternConfig.config;

	let prevFacet: PathSegment[] | undefined;
	let nextFacet: PathSegment[] | undefined;
	let thisFacet: PathSegment[];
	let thisQuad: Quadrilateral;
	const finalFacets: PathSegment[][] = [];
	const finalQuads: Quadrilateral[] = [];

	if (endLooped > 0) {
		const index = patternBand.length - 1;
		thisFacet = patternBand[index];
		thisQuad = quadBand[index];
		const nextQuad = quadBand[0];
		const tDiff = { x: thisQuad.d.x - nextQuad.a.x, y: thisQuad.d.y - nextQuad.a.y };
		const aDiff = getAngle(thisQuad.d, thisQuad.c) - getAngle(nextQuad.a, nextQuad.b);

		for (let k = 0; k < endLooped; k++) {
			const translatedQuad = translateQuad(structuredClone(quadBand[k]), tDiff.x, tDiff.y);
			finalQuads.push(rotateQuad(translatedQuad, aDiff, thisQuad.d));

			const translated = translatePS(structuredClone(patternBand[k]), tDiff.x, tDiff.y);
			finalFacets.push(rotatePS(translated, aDiff, thisQuad.d));
		}
		patternBand.push(...finalFacets);
		quadBand.push(...finalQuads);
	}

	patternBand = patternBand.map((facet, i, facets) => {
		thisFacet = facet;
		thisQuad = quadBand[i];
		if (i === 0) {
			const prevQuad = quadBand[facets.length - 1];
			const tDiff = { x: thisQuad.a.x - prevQuad.d.x, y: thisQuad.a.y - prevQuad.d.y };
			const rDiff = 0;
			prevFacet = endsMatched
				? rotatePS(translatePS(structuredClone(facets[facets.length - 1]), tDiff.x, tDiff.y), rDiff)
				: undefined;
			nextFacet = facets[i + 1];
		} else if (i === facets.length - 1) {
			const nextQuad = quadBand[0];
			const tDiff = { x: thisQuad.d.x - nextQuad.a.x, y: thisQuad.d.y - nextQuad.a.y };
			const aDiff = getAngle(thisQuad.d, thisQuad.c) - getAngle(nextQuad.a, nextQuad.b);
			prevFacet = facets[i - 1];
			nextFacet = endsMatched
				? rotatePS(translatePS(structuredClone(facets[0]), tDiff.x, tDiff.y), aDiff, thisQuad.d)
				: undefined;
		} else {
			prevFacet = facets[i - 1];
			nextFacet = facets[i + 1];
		}
		return straightenEndSegments({
			prevFacet,
			thisFacet,
			nextFacet,
			rows: (tiledPatternConfig.config.rowCount || 1) as number,
			columns: (tiledPatternConfig.config.columnCount || 1) as number
		});
	});

	if (endsTrimmed) {
		const startSegments = hexSegments(
			'start',
			rowCount || 1,
			columnCount || 1,
			patternBand[0].length
		).flat();
		const endSegments = hexSegments(
			'end',
			rowCount || 1,
			columnCount || 1,
			patternBand[patternBand.length - 1].length
		).flat();
		patternBand[0].splice(0, startSegments.length);
		patternBand[patternBand.length - 1].splice(Math.min(...endSegments), endSegments.length);
	}

	return patternBand;
};
