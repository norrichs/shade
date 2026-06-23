import { Vector3, type Box3 } from 'three';

export const MM_PER_INCH = 25.4;

export const inchToMm = (inch: number): number => inch * MM_PER_INCH;
export const mmToInch = (mm: number): number => mm / MM_PER_INCH;

export type DerivedDimensions = {
	mm: { x: number; y: number; z: number };
	inch: { x: number; y: number; z: number };
};

// Convert a 3D model bounding box (pattern/model units) into real-world page
// units. delta_mm = delta_units / pageScale (pageScale = pattern-units per mm).
export const derivePageDimensions = (bounds: Box3, pageScale: number): DerivedDimensions => {
	const size = new Vector3();
	bounds.getSize(size);
	const mm = { x: size.x / pageScale, y: size.y / pageScale, z: size.z / pageScale };
	return { mm, inch: { x: mmToInch(mm.x), y: mmToInch(mm.y), z: mmToInch(mm.z) } };
};
