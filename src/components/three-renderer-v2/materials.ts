import { DoubleSide, MeshPhysicalMaterial } from 'three';

const theme = {
	colorSelected: 'rgb(0,150,255)',
	colorSecondarySelected: 'rgba(100, 200, 255)',
	colorDefault: 'khaki',
	colorHighlightedPrimary: 'orangered',
	colorHighlightedSecondary: "cornflowerblue"
};

export const materials = {
	default: new MeshPhysicalMaterial({
		color: theme.colorDefault,
		transparent: true,
		opacity: 0.90,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	selected: new MeshPhysicalMaterial({
		color: theme.colorSelected,
		transparent: false,
		opacity: 1,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	selectedLight: new MeshPhysicalMaterial({
		color: theme.colorSecondarySelected,
		transparent: true,
		opacity: 0.95,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	selectedVeryLight: new MeshPhysicalMaterial({
		color: theme.colorSecondarySelected,
		transparent: true,
		opacity: 0.65,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	highlightedPrimary: new MeshPhysicalMaterial({
		color: theme.colorHighlightedPrimary,
		transparent: false,
		opacity: 0.95,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	highlightedSecondary: new MeshPhysicalMaterial({
		color: theme.colorHighlightedSecondary,
		transparent: true,
		opacity: 0.95,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	})
};

export type Material = keyof typeof materials;