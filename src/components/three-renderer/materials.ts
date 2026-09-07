import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import type { ThreeColor } from './colors';
import type { GlobuleAddress_Band, GlobuleAddress_Facet } from '$lib/projection-geometry/types';
import { sameGlobuleBand, type AssemblerHighlight } from '$lib/assembler-highlight';
import type { SelectedProjectionGeometry } from '$lib/stores/selectionStores';
import { HIGHLIGHT_PRIMARY, HIGHLIGHT_SECONDARY } from '$lib/highlight-colors';

const theme = {
	colorSelected: 'rgb(0,150,255)',
	colorSecondarySelected: 'rgba(100, 200, 255)',
	colorDefault: 'white',
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
	return new MeshStandardMaterial({ ...defaultStandardMaterialConfig, opacity: 0.9, color });
});

const striped = ['magenta', 'cyan'].map((color) => {
	return new MeshStandardMaterial({ ...defaultStandardMaterialConfig, opacity: 0.9, color });
});

export const materials = {
	numbered,
	striped,
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
	}),
	// Assembler cross-view highlight: the band clicked in the data grid.
	assemblerPrimary: new MeshPhysicalMaterial({
		color: HIGHLIGHT_PRIMARY,
		transparent: false,
		opacity: 1,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	// Assembler cross-view highlight: the other bands in the clicked band's ring.
	assemblerSecondary: new MeshStandardMaterial({
		color: HIGHLIGHT_SECONDARY,
		transparent: true,
		opacity: 0.95,
		side: DoubleSide
	}),
	partnerBase: new MeshStandardMaterial({
		color: 'rgb(80, 130, 200)',
		transparent: true,
		opacity: 0.7,
		side: DoubleSide
	}),
	partnerWithinBand: new MeshStandardMaterial({
		color: 'rgb(180, 140, 80)',
		transparent: true,
		opacity: 0.7,
		side: DoubleSide
	}),
	partnerAcrossBands: new MeshStandardMaterial({
		color: 'rgb(120, 120, 120)',
		transparent: true,
		opacity: 0.7,
		side: DoubleSide
	}),
	// Model-size measurement indicators: one opaque colour per axis
	// (x = red, y = green, z = blue) so matched extent pairs read at a glance.
	axisX: new MeshStandardMaterial({ color: 'red', transparent: false, side: DoubleSide }),
	axisY: new MeshStandardMaterial({ color: 'lime', transparent: false, side: DoubleSide }),
	axisZ: new MeshStandardMaterial({ color: 'blue', transparent: false, side: DoubleSide }),
	// Magenta marks a measurement point still waiting for its partner; once
	// paired, both ends turn black.
	measurePending: new MeshStandardMaterial({
		color: 'magenta',
		transparent: false,
		side: DoubleSide
	}),
	measureMatched: new MeshStandardMaterial({
		color: 'black',
		transparent: false,
		side: DoubleSide
	})
};

export const materialByColor = (color: ThreeColor) => {
	return new MeshStandardMaterial({ ...defaultStandardMaterialConfig, color });
};

export type Material = keyof typeof materials;

export type MaterialSelectionConfig = {
	colorByBand?: boolean;
	zebraStriped?: boolean;
};

const defaultMaterialSelectionConfig: MaterialSelectionConfig = {
	colorByBand: false,
	zebraStriped: false
};

/**
 * Material for a whole band mesh, honouring the Assembler cross-view highlight.
 *
 * Band meshes have no selection state of their own (selection is per facet), so this
 * is highlight-or-`fallback`: the clicked band paints primary, the rest of its ring
 * secondary. Keeps a bands-only 3D view usable for assembly, where enabling facets
 * just to see the highlight would change what the model looks like.
 *
 * `fallback` is the colour the mesh had before highlighting existed — each band
 * source picks its own (voronoi rim tubes red, projection bands `selected`, and so
 * on), so an unhighlighted band still reads the way it always did.
 */
export const getBandMaterial = (
	address: GlobuleAddress_Band | undefined,
	highlight: AssemblerHighlight = null,
	fallback: MeshStandardMaterial | MeshPhysicalMaterial = materials.default
) => {
	if (address && highlight) {
		if (sameGlobuleBand(address, highlight.band)) return materials.assemblerPrimary;
		if (highlight.ring.some((b) => sameGlobuleBand(address, b)))
			return materials.assemblerSecondary;
	}
	return fallback;
};

export const getMaterial = (
	address: GlobuleAddress_Facet,
	selectedGeometry: SelectedProjectionGeometry,
	config: MaterialSelectionConfig = defaultMaterialSelectionConfig,
	highlight: AssemblerHighlight = null
) => {
	// Assembler cross-view highlight takes precedence over normal selection
	// colouring so a grid-clicked band reads clearly in 3D.
	if (highlight) {
		if (sameGlobuleBand(address, highlight.band)) return materials.assemblerPrimary;
		if (highlight.ring.some((b) => sameGlobuleBand(address, b)))
			return materials.assemblerSecondary;
	}

	if (!selectedGeometry?.selected) return materials.default;

	if (selectedGeometry.isSelected(address)) return materials.selected;

	if (selectedGeometry.isPartner(address)) return materials.highlightedPrimary;

	if (selectedGeometry.isStartPartner(address)) return materials.numbered[4];

	if (selectedGeometry.isEndPartner(address)) return materials.numbered[1];

	if (config.colorByBand) return materials.numbered[address.band];
	if (config.zebraStriped) return materials.striped[address.band % 2];

	return materials.default;
};
