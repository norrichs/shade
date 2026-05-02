import type { TransformConfig } from '$lib/projection-geometry/types';
import type {
	BandCutPattern,
	CutPattern,
	PathSegment,
	SkipEdges,
	TubeCutPattern
} from '$lib/types';
import { isSameAddress } from '$lib/util';
import type { IndexPair } from '../../spec-types';

export const retarget = (
	indices: number[],
	rows: number,
	columns: number,
	startCount: number,
	middleCount: number,
	endCount: number
) => {
	const retargeted = indices.flatMap((index) => {
		const result: number[] = [];

		if (index < startCount && columns > 1) {
			for (let c = 0; c < columns; c++) {
				result.push(index + c * startCount);
			}
			return result;
		}
		if (index >= startCount + middleCount && columns > 1) {
			const localIndex = index - startCount - middleCount;
			const entryPoint = startCount * columns + middleCount * rows * columns;
			for (let c = 0; c < columns; c++) {
				result.push(entryPoint + localIndex + c * endCount);
			}
			return result;
		}
		if (
			index >= startCount &&
			index < startCount + middleCount &&
			(columns > 1 || rows > 1)
		) {
			const entryPoint = startCount * columns + middleCount * (rows - 1) * columns;
			for (let c = 0; c < columns; c++) {
				result.push(entryPoint + index + c * middleCount);
			}
			return result;
		}
		return index;
	});
	return retargeted;
};

export const replaceInPlace = ({
	pairs,
	target,
	source
}: {
	pairs: IndexPair[];
	target: PathSegment[];
	source: PathSegment[];
}) => {
	for (const { source: si, target: ti } of pairs) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-expect-error: writing 3-tuple where caller may have wider PathSegment union
		target[ti] = [target[ti][0], source[si][1], source[si][2]];
	}
};

export const evaluateSkipEdge = (skip: SkipEdges, index: number, limit: number) => {
	switch (skip) {
		case 'not-both':
			return index > 0 && index < limit;
		case 'not-first':
			return index > 0;
		case 'not-last':
			return index < limit;
		case 'all':
			return true;
		default:
			return false;
	}
};

export const removeInPlace = ({
	indices,
	target
}: {
	indices: number[];
	target: PathSegment[];
}) => {
	const sortedDescending = [...indices].sort((a, b) => b - a);
	for (const index of sortedDescending) {
		target.splice(index, 1);
	}
};

export const getTransformedPartnerCutPattern = (
	band: BandCutPattern,
	f: number,
	tubes: TubeCutPattern[],
	endsMatched: boolean
): CutPattern | undefined => {
	if (!endsMatched || !band.meta || (f !== 0 && f !== band.facets.length - 1)) return undefined;

	const partnerAddress = f === 0 ? band.meta.startPartnerBand : band.meta.endPartnerBand;
	const transform: TransformConfig | undefined =
		f === 0 ? band.meta.startPartnerTransform : band.meta.endPartnerTransform;
	const partnerTube = tubes[partnerAddress.tube];
	if (!partnerTube) return undefined;
	const partnerBand =
		partnerTube.bands.find((b) => b.address.band === partnerAddress.band) ??
		partnerTube.bands[partnerAddress.band];
	if (!partnerBand?.meta) return undefined;
	const partnerFacetIndex = isSameAddress(partnerBand.meta.startPartnerBand, band.address)
		? 0
		: partnerBand.facets.length - 1;
	const partnerFacet: CutPattern = partnerBand.facets[partnerFacetIndex];
	const partnerPath = structuredClone(partnerFacet.path);
	const transformedPartnerPath = transform ? newTransformPS(partnerPath, transform) : partnerPath;

	return { path: transformedPartnerPath, label: `${partnerFacetIndex}` };
};

export const newTransformPS = (path: PathSegment[], transform: TransformConfig) => {
	const {
		translate: { x: translateX, y: translateY },
		rotate: { z: theta }
	} = transform;
	const thetaRad = (theta * Math.PI) / 180;
	const cos = Math.cos(thetaRad);
	const sin = Math.sin(thetaRad);

	const transformPoint = (x: number, y: number): [number, number] => {
		const x2 = cos * x - sin * y + translateX;
		const y2 = sin * x + cos * y + translateY;
		return [x2, y2];
	};

	const transformed: PathSegment[] = path.map((seg) => {
		switch (seg[0]) {
			case 'M': {
				const [x, y] = transformPoint(seg[1], seg[2]);
				return ['M', x, y];
			}
			case 'L': {
				const [x, y] = transformPoint(seg[1], seg[2]);
				return ['L', x, y];
			}
			case 'Q': {
				const [cx, cy] = transformPoint(seg[1], seg[2]);
				const [x, y] = transformPoint(seg[3], seg[4]);
				return ['Q', cx, cy, x, y];
			}
			case 'C': {
				const [c1x, c1y] = transformPoint(seg[1], seg[2]);
				const [c2x, c2y] = transformPoint(seg[3], seg[4]);
				const [x, y] = transformPoint(seg[5], seg[6]);
				return ['C', c1x, c1y, c2x, c2y, x, y];
			}
			case 'A': {
				const [x, y] = transformPoint(seg[6], seg[7]);
				const xAxisRotation = seg[3] + theta;
				return ['A', seg[1], seg[2], xAxisRotation, seg[4], seg[5], x, y];
			}
			case 'Z':
				return ['Z'];
			default:
				return seg;
		}
	});

	return transformed;
};
