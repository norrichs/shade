import { DoubleSide, MeshPhysicalMaterial } from 'three';

const theme = {
	colorSelected: 'lightskyblue',
	colorDefault: 'orange'
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
	})
};