import { DoubleSide, MeshPhysicalMaterial } from 'three';

const theme = {
	colorSelected: 'lightskyblue',
	colorDefault: 'orange',
	colorHighlightedPrimary: 'orangered',
	colorHighlightedSecondary: "cornflowerblue"
};

export const materials = {
	default: new MeshPhysicalMaterial({
		color: theme.colorDefault,
		transparent: true,
		opacity: 0.95,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	selected: new MeshPhysicalMaterial({
		color: theme.colorSelected,
		transparent: true,
		opacity: 0.95,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	highlightedPrimary: new MeshPhysicalMaterial({
		color: theme.colorHighlightedPrimary,
		transparent: true,
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