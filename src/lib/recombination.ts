import { cloneBand, cloneGlobuleData } from './generate-superglobule';
import { isSameBand, isSameGlobule } from './matchers';
import type {
	BandAddressed,
	BandMapping,
	GeometryAddress,
	Globule,
	GlobuleAddressed,
	GlobuleConfigCoordinates,
	GlobuleData,
	Recombination,
	SubGlobule
} from './types';

export const matchRecombinationCoordinates = (
	a: GlobuleConfigCoordinates,
	b: GlobuleConfigCoordinates
) => {
	return a.s === b.s && a.t === b.t && a.r === b.r;
};

export const recombineSubGlobules = (subGlobules: SubGlobule[]) => {
	const recombinedSubGlobules = subGlobules.map((subGlobule) => {
		return {
			...subGlobule,
			data: subGlobule.data.map((globule, i) => {
				return {
					...globule,
					data: generateRecombined(globule.data, subGlobules, globule.recombination, i)
				};
			})
		};
	});

	return hidePartnerBands(recombinedSubGlobules);
};

const hidePartnerBands = (subGlobules: SubGlobule[]) => {
	const partners: GeometryAddress<BandAddressed>[] = [];

	let bandMap: BandMapping[] | undefined;
	for (let i = 0; i < subGlobules.length; i++) {
		for (let j = 0; j < subGlobules[i].data.length; j++) {
			bandMap = subGlobules[i].data[j].recombination?.bandMap;
			if (bandMap) {
				for (let k = 0; k < bandMap.length; k++) {
					partners.push(bandMap[k].partnerAddress);
				}
			}
		}
	}

	let bandAddress: GeometryAddress<BandAddressed>;
	for (let i = 0; i < subGlobules.length; i++) {
		for (let j = 0; j < subGlobules[i].data.length; j++) {
			for (let k = 0; k < subGlobules[i].data[j].data.bands.length; k++) {
				bandAddress = { ...subGlobules[i].data[j].address, b: k };
				const isPartner = partners.some((p) => isSameBand(p, bandAddress));
				subGlobules[i].data[j].data.bands[k].visible = !isPartner;
			}
		}
	}
	return subGlobules;
};

const generateRecombined = (
	globuleData: GlobuleData,
	subGlobules: SubGlobule[],
	recombination: Recombination | undefined,
	globuleIndex: number
): GlobuleData => {
	if (recombination === undefined) return globuleData;
	const newGlobuleData = cloneGlobuleData(globuleData);
	recombination.bandMap.forEach((mapping) => {
		let partnerBand;
		try {
			partnerBand = cloneBand(getGlobuleBand(subGlobules, mapping.partnerAddress));
			if (mapping.originJoin === 'end' && mapping.partnerJoin === 'end') {
				newGlobuleData.bands[mapping.originIndex].facets = [
					...newGlobuleData.bands[mapping.originIndex].facets,
					...partnerBand.facets
				];
			}
			if (mapping.originJoin === 'start' && mapping.partnerJoin === 'start') {
				newGlobuleData.bands[mapping.originIndex].facets = [
					...newGlobuleData.bands[mapping.originIndex].facets.reverse(),
					...partnerBand.facets.reverse()
				];
			}
			if (mapping.originJoin === 'end' && mapping.partnerJoin === 'start') {
				newGlobuleData.bands[mapping.originIndex].facets = [
					...newGlobuleData.bands[mapping.originIndex].facets,
					...partnerBand.facets.reverse()
				];
			}
			if (mapping.originJoin === 'start' && mapping.partnerJoin === 'end') {
				newGlobuleData.bands[mapping.originIndex].facets = [
					...newGlobuleData.bands[mapping.originIndex].facets.reverse(),
					...partnerBand.facets
				];
			}
		} catch {
			console.error('error with recombining');
		}
	});

	return newGlobuleData;
};

const getGlobuleBand = (subGlobules: SubGlobule[], address: GeometryAddress<BandAddressed>) => {
	const resultGlobule = subGlobules[address.s].data.find((globule) =>
		isSameGlobule(globule.address, address)
	);
	if (!resultGlobule) throw new Error('cannot find globule by address');
	const resultBand = resultGlobule.data.bands[address.b] || undefined;
	if (!resultBand) throw new Error('cannot find band by address');
	return resultBand;
};

export const formatBandMapping = (mapping: BandMapping): string =>
	`(originIndex: ${mapping.originIndex}, partnerAddress: ${mapping.partnerAddress.g.join(
		', '
	)} b: ${mapping.partnerAddress.b})`;

export const formatBandMap = (bandMap: BandMapping[]): string => {
	return bandMap.map((mapping) => formatBandMapping(mapping)).join('\n');
};

export const formatAddress = (a?: GeometryAddress<BandAddressed | GlobuleAddressed>) => {
	if (!a) return 'undefined';
	return `s: ${a.s}, g: [${a.g.join(', ')}], b: ${a.b ?? 'undefined'}`;
};
