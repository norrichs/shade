import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import type { ThreeColor } from './colors';
import type { GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import type { SelectedProjectionGeometry } from '$lib/stores/selectionStores';

const theme = {
	colorSelected: 'rgb(0,150,255)',
	colorSecondarySelected: 'rgba(100, 200, 255)',
	colorDefault: 'khaki',
	colorHighlightedPrimary: 'black',
	colorHighlightedSecondary: 'cornflowerblue'
};

// Standard material config for non-selected geometry (better performance)
const defaultStandardMaterialConfig = {
	color: theme.colorDefault,
	transparent: true,
	opacity: 1,
	side: DoubleSide
};

// Physical material config for selected geometry (better visuals)
const defaultPhysicalMaterialConfig = {
	color: theme.colorDefault,
	transparent: true,
	opacity: 1,
	clearcoat: 1,
	clearcoatRoughness: 0,
	side: DoubleSide
};

const colorList: ThreeColor[] = [
	'darkred',
	'red',
	'orange',
	'yellow',
	'lime',
	'green',
	'forestgreen',
	'olivedrab',
	'lightblue',
	'blue',
	'indigo',
	'violet',
	'darkorchid',
	'aquamarine',
	'antiquewhite',
	'darkmagenta',
	'cadetblue',
	'blueviolet',
	'darkseagreen',
	'slateblue',
	'hotpink',
	'indianred'
];

// Use Standard material for numbered colors (better performance)
const numbered = colorList.map((color) => {
	return new MeshStandardMaterial({ ...defaultStandardMaterialConfig, color });
});

export const materials = {
	numbered,
	// Use Standard material for default (5-8% faster rendering)
	default: new MeshStandardMaterial({
		color: theme.colorDefault,
		transparent: true,
		opacity: 0.9,
		side: DoubleSide
	}),
	// Keep Physical material for selected (needs to stand out)
	selected: new MeshPhysicalMaterial({
		color: theme.colorSelected,
		transparent: false,
		opacity: 1,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	// Use Standard for light variants (better performance)
	selectedLight: new MeshStandardMaterial({
		color: theme.colorSecondarySelected,
		transparent: true,
		opacity: 0.95,
		side: DoubleSide
	}),
	selectedVeryLight: new MeshStandardMaterial({
		color: theme.colorSecondarySelected,
		transparent: true,
		opacity: 0.5,
		side: DoubleSide
	}),
	// Keep Physical for highlighted primary (needs to stand out)
	highlightedPrimary: new MeshPhysicalMaterial({
		color: theme.colorHighlightedPrimary,
		transparent: false,
		opacity: 0.95,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	// Use Standard for secondary highlights (better performance)
	highlightedSecondary: new MeshStandardMaterial({
		color: theme.colorHighlightedSecondary,
		transparent: true,
		opacity: 0.95,
		side: DoubleSide
	})
};

export const materialByColor = (color: ThreeColor) => {
	return new MeshStandardMaterial({ ...defaultStandardMaterialConfig, color });
};

export type Material = keyof typeof materials;

export type MaterialSelectionConfig = {
	colorByBand?: boolean;
	colorEndFacets?: boolean;
};

const defaultMaterialSelectionConfig: MaterialSelectionConfig = {
	colorByBand: false,
	colorEndFacets: false
};

export const getMaterial = (
	address: GlobuleAddress_Facet,
	selectedGeometry: SelectedProjectionGeometry,
	config: MaterialSelectionConfig = defaultMaterialSelectionConfig
) => {
	const { colorByBand, colorEndFacets } = config;

	if (address.facet <= 1 && colorEndFacets) return materialByColor('springgreen');

	if (!selectedGeometry?.selected) return materials.default;

	if (selectedGeometry.isSelected(address)) return materials.selected;

	if (selectedGeometry.isPartner(address)) return materials.highlightedPrimary;

	if (selectedGeometry.isStartPartner(address)) return materials.numbered[4];

	if (selectedGeometry.isEndPartner(address)) return materials.numbered[1];

	if (colorByBand) return materials.numbered[address.band];

	return materials.default;
};
