import type {
	GeometryAddress,
	BandAddressed,
	GlobuleAddressed,
	Id,
	BandConfigCoordinates,
	GlobuleConfigCoordinates
} from '$lib/types';
import { derived, writable } from 'svelte/store';
import { superConfigStore } from './superGlobuleStores';

export const selectedGlobule = writable<{
	address?: GeometryAddress<BandAddressed | GlobuleAddressed>;
	subGlobuleConfigIndex: number;
	subGlobuleConfigId?: Id;
	// subGlobuleRecurrence?: number;
	subGlobuleGeometryIndex?: number;
	globuleId?: Id;
}>({
	address: undefined,
	subGlobuleConfigIndex: 0,
	subGlobuleConfigId: undefined,
	// subGlobuleRecurrence: undefined,
	subGlobuleGeometryIndex: undefined,
	globuleId: undefined
});

export type SelectionType = 'highlighted' | 'active' | 'hovered';

export type ActiveGeometryAddress = GeometryAddress<BandAddressed> & { t?: number };

export type BandSelection = {
	selection: SelectionType[];
	coord: BandConfigCoordinates;
	coordStack?: GlobuleConfigCoordinates[];
	address: GeometryAddress<BandAddressed>;
	subGlobuleConfigIndex: number;
	subGlobuleConfigId?: Id;
	subGlobuleRecurrence?: number;
	globuleId?: Id;
	transformIndex?: number;
	subGlobuleGeometryIndex?: number;
	bandIndex?: number;
};

export const selectedBand = writable<ActiveGeometryAddress>({ s: 0, g: [], b: 0 });

export const generateGenericSelection = (sgIndex: number, tCount?: number, bIndex?: number) => {
	return { s: sgIndex, g: new Array(tCount).fill(0), b: bIndex ?? 0 };
};

export const selectedSubGlobuleIndex = derived(
	[superConfigStore, selectedGlobule],
	([$superConfigStore, $selectedGlobule]) => {
		const index = $selectedGlobule.globuleId
			? $superConfigStore.subGlobuleConfigs.findIndex(
					(subGlobuleConfig) => subGlobuleConfig.globuleConfig.id === $selectedGlobule.globuleId
			  )
			: 0;

		return index;
	}
);

export const selectedGlobuleConfig = derived(
	[superConfigStore, selectedSubGlobuleIndex],
	([$superConfigStore, $selectedSubGlobuleIndex]) => {
		return $superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig;
	}
);
