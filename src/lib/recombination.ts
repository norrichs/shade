import type { BandAddressed, BandMapping, GeometryAddress, GlobuleAddressed } from './types';

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
