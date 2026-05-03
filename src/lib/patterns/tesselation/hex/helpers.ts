import type { PathSegment } from '$lib/types';

const hexSegments = (
	end: 'start' | 'end',
	rows: number,
	columns: number,
	facetLength: number
): [number, number][] => {
	if (rows < 1 || columns < 1) {
		console.error('rows and columns must be >=1');
		return [[0, 0]];
	}
	const indices: [number, number][] = [];
	for (let c = 0; c < columns; c++) {
		if (end === 'start') {
			indices.push([c * 2, c * 2 + 1]);
		} else {
			const startIndex = facetLength - columns * 2;
			indices.push([startIndex + c * 2, startIndex + c * 2 + 1]);
		}
	}
	return indices;
};

export type StraightenEndSegmentsProps = {
	prevFacet: PathSegment[] | undefined;
	thisFacet: PathSegment[];
	nextFacet: PathSegment[] | undefined;
	rows: number;
	columns: number;
};

export const straightenEndSegments = ({
	prevFacet,
	thisFacet,
	nextFacet,
	rows,
	columns
}: StraightenEndSegmentsProps): PathSegment[] => {
	const startSegmentIndices = hexSegments('start', rows, columns, thisFacet.length);
	const endSegmentIndices = hexSegments('end', rows, columns, thisFacet.length);

	const output = structuredClone(thisFacet);

	let firstStartIndex, secondStartIndex, firstEndIndex, secondEndIndex;
	for (let i = 0; i < startSegmentIndices.length; i++) {
		[firstStartIndex, secondStartIndex] = startSegmentIndices[i];
		[firstEndIndex, secondEndIndex] = endSegmentIndices[i];

		if (prevFacet) {
			output[firstStartIndex][1] = prevFacet[firstEndIndex][1];
			output[firstStartIndex][2] = prevFacet[firstEndIndex][2];
		}

		if (nextFacet) {
			output[secondEndIndex][1] = nextFacet[secondStartIndex][1];
			output[secondEndIndex][2] = nextFacet[secondStartIndex][2];
		}
	}

	return output;
};

export { hexSegments };
