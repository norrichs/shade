import type { PathSegment, CutPattern, MovePathSegment } from '$lib/types';
import { transformPatternByQuad } from './quadrilateral';
import { translatePS, getAngle, rotatePoint } from './utils';
import { Vector3 } from 'three';

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

export const adjustCarnation = (tiledBands: { facets: CutPattern[] }[], variant: 0 | 1) => {
	const patternPrototype = generateCarnation({ variant, size: 1, rows: 1, columns: 1 });
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
					x: facet.quad.a.x - addendaFacet0.quad.b.x,
					y: facet.quad?.a.y - addendaFacet0.quad?.b.y
				};
				const offsetAngle =
					getAngle(facet.quad.a, facet.quad.d) -
					getAngle(addendaFacet0.quad.b, addendaFacet0.quad.c);
				const anchorPoint = {
					x: addendaFacet0.quad.b.x + offset.x,
					y: addendaFacet0.quad.b.y + offset.y
				};
				const rotatedA = rotatePoint(
					anchorPoint,
					{ x: addendaFacet0.quad.a.x + offset.x, y: addendaFacet0.quad.a.y + offset.y },
					offsetAngle
				);
				const rotatedC = rotatePoint(
					anchorPoint,
					{ x: addendaFacet0.quad.c.x + offset.x, y: addendaFacet0.quad.c.y + offset.y },
					offsetAngle
				);
				const rotatedD = rotatePoint(
					anchorPoint,
					{ x: addendaFacet0.quad.d.x + offset.x, y: addendaFacet0.quad.d.y + offset.y },
					offsetAngle
				);
				addendaFacet0.quad = {
					a: new Vector3(rotatedA.x, rotatedA.y, 0),
					b: new Vector3(anchorPoint.x, anchorPoint.y, 0),
					c: new Vector3(rotatedC.x, rotatedC.y, 0),
					d: new Vector3(rotatedD.x, rotatedD.y, 0)
				};
			}

			// addendaPath0 =
			const addenda0 = {
				quad: addendaFacet0.quad,
				quadWidth: addendaFacet0.quadWidth,
				path: addendaFacet0.quad ? transformPatternByQuad(addendaPrototype, addendaFacet0.quad) : []
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
