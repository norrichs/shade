import type {
	BandAddressed,
	BandConfigCoordinates,
	BandMapping,
	GeometryAddress,
	GlobuleAddressed,
	GlobuleConfigCoordinates,
	Recombination
} from './types';

export const matchBandConfigCoordinates = (
	a: BandConfigCoordinates,
	b: BandConfigCoordinates,
	matchAncestors = false
) => {
	if (matchAncestors) {
		console.debug('matchAncestors', a, b);
		return a.s === b.s && a.t < b.t;
	}
	return a.s === b.s && a.t === b.t && a.r === b.r && a.b === b.b;
};

export const matchGlobuleConfigCoordinates = (
	a: BandConfigCoordinates | GlobuleConfigCoordinates | undefined,
	b: BandConfigCoordinates | GlobuleConfigCoordinates | undefined
) => {
	if (a === undefined || b === undefined) {
		return false;
	}
	return a.s === b.s && a.t === b.t && a.r === b.r;
};

export const includesGlobuleCoordinates = (
	stack: GlobuleConfigCoordinates[],
	item: GlobuleConfigCoordinates | BandConfigCoordinates
) => {
	return stack.some((coord) => matchGlobuleConfigCoordinates(coord, item));
};

export const isSameBand = (a: GeometryAddress<BandAddressed>, b: GeometryAddress<BandAddressed>) => {
	return a.s === b.s && a.g.join('-') === b.g.join('-') && a.b === b.b;
};

export const isSameGlobule = (
	a: GeometryAddress<GlobuleAddressed | BandAddressed>,
	b: GeometryAddress<GlobuleAddressed | BandAddressed>
) => {
	return a.s === b.s && a.g.join('-') === b.g.join('-');
};

export const matchBandMaps = (a: BandMapping, b: BandMapping) => {
	return (
		a.originIndex === b.originIndex &&
		a.originJoin === b.originJoin &&
		a.partnerJoin === b.partnerJoin &&
		isSameBand(a.partnerAddress, b.partnerAddress)
	);
};

export const isSameBandMaps = (a: BandMapping[], b: BandMapping[]) => {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		for (let j = 0; j < b.length; j += 1) {
			if (!matchBandMaps(a[i], a[j])) {
				return false;
			}
		}
	}
	return true;
};

export const isSameRecombination = (a?: Recombination, b?: Recombination) => {
	return (
		a !== undefined &&
		b !== undefined &&
		isSameBandMaps(a.bandMap, b.bandMap)
	);
};