import { DoubleSide, MeshPhysicalMaterial } from 'three';

export const materials = [
	new MeshPhysicalMaterial({
		color: 'orange',
		transparent: true,
		opacity: 0.95,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	}),
	new MeshPhysicalMaterial({
		color: 'green',
		transparent: true,
		opacity: 0.95,
		clearcoat: 1,
		clearcoatRoughness: 0,
		side: DoubleSide
	})
];
