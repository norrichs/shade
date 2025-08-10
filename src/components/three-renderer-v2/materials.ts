import {
	BackSide,
	Color,
	DoubleSide,
	FrontSide,
	MeshPhysicalMaterial,
	type ColorRepresentation
} from 'three';
import type { ThreeColor } from './colors';

const theme = {
	colorSelected: 'rgb(0,150,255)',
	colorSecondarySelected: 'rgba(100, 200, 255)',
	colorDefault: 'khaki',
	colorHighlightedPrimary: 'black',
	colorHighlightedSecondary: 'cornflowerblue'
};

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

const numbered = colorList.map((color) => {
	return new MeshPhysicalMaterial({ ...defaultPhysicalMaterialConfig, color });
});

export const materials = {
	numbered,
	default: new MeshPhysicalMaterial({
		color: theme.colorDefault,
		transparent: true,
		opacity: 0.9,
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
		opacity: 0.5,
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
