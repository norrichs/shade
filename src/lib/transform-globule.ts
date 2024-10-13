import { Vector3 } from 'three';
import type {
	GlobuleData,
	Point3,
	Band,
	Facet,
	GlobuleRotate,
	GlobuleTransform,
	GlobuleTransformTranslate,
	GlobuleTransformReflect,
	GlobuleTransformRotate,
	GlobuleTransformScale,
	Recurrence,
	ChainableTransform,
	Globule
} from './types';
import { radToDeg } from 'three/src/math/MathUtils.js';
import { cloneGlobuleData } from './generate-superglobule';

const constants = {
	rotate: {
		title: 'Rotation',
		defaultTransform: {
			recurs: [1],
			rotate: { axis: { x: 0, y: 0, z: 1 }, anchor: { x: 0, y: 0, z: 0 }, angle: 0 }
		}
	},
	translate: {
		title: 'Translation',
		defaultTransform: { recurs: [1], translate: { x: 0, y: 0, z: 0 } }
	},
	scale: { title: 'Scale', defaultTransform: undefined },
	reflect: { title: 'Reflect', defaultTransform: undefined }
};

export const getConstants = (tx: GlobuleTransform) => {
	if (isGlobuleTransformRotate(tx)) return constants.rotate;
	if (isGlobuleTransformTranslate(tx)) return constants.translate;
	if (isGlobuleTransformReflect(tx)) return constants.reflect;
	if (isGlobuleTransformScale(tx)) return constants.scale;
	return constants.translate;
};

const isKeyOfConstants = (key: string): key is keyof typeof constants => {
	return Object.keys(constants).includes(key);
};

export const getDefaultTransform = (key: string) => {
	if (isKeyOfConstants(key) && constants[key].defaultTransform) {
		return constants[key].defaultTransform;
	}
};

export const isGlobuleTransformTranslate = (
	tx: GlobuleTransform
): tx is GlobuleTransformTranslate => Object.hasOwn(tx, 'translate');
export const isGlobuleTransformRotate = (tx: GlobuleTransform): tx is GlobuleTransformRotate =>
	Object.hasOwn(tx, 'rotate');
export const isGlobuleTransformReflect = (tx: GlobuleTransform): tx is GlobuleTransformReflect =>
	Object.hasOwn(tx, 'reflect');
export const isGlobuleTransformScale = (tx: GlobuleTransform): tx is GlobuleTransformScale =>
	Object.hasOwn(tx, 'scale');

export const transformMutableGlobuleData = (
	globuleData: GlobuleData,
	transform: GlobuleTransform,
	multiplier = 1
): GlobuleData => {
	if (isGlobuleTransformTranslate(transform)) {
		return translateMutableGlobule(globuleData, transform.translate, multiplier);
	} else if (isGlobuleTransformRotate(transform)) {
		return rotateMutableGlobule(globuleData, transform.rotate, multiplier);
	} else {
		return globuleData;
	}
};

const translateMutableGlobule = (
	globuleData: GlobuleData,
	offset: Point3,
	multiplier: number
): GlobuleData => {
	let bands: Band[] = globuleData.bands;

	const translationVector = new Vector3(offset.x, offset.y, offset.z);

	console.debug('translateMutableGlobule', { multiplier, translationVector });

	bands = bands.map((band: Band) => ({
		...band,
		facets: band.facets.map((f: Facet) => ({
			...f,
			triangle: f.triangle.set(
				f.triangle.a.addScaledVector(translationVector, multiplier),
				f.triangle.b.addScaledVector(translationVector, multiplier),
				f.triangle.c.addScaledVector(translationVector, multiplier)
			)
		}))
	}));
	return { bands };
};

const rotateMutableGlobule = (
	globuleData: GlobuleData,
	{ angle, anchor, axis }: GlobuleRotate,
	multiplier: number
) => {
	const anchorVector = new Vector3(anchor.x, anchor.y, anchor.z);
	const axisVector = new Vector3(axis.x, axis.y, axis.z);
	const a = (angle * multiplier) % (Math.PI * 2);
	const bands = globuleData.bands.map((band: Band) => ({
		...band,
		facets: band.facets.map((f: Facet) => ({
			...f,
			triangle: f.triangle.set(
				rotateVector(f.triangle.a, anchorVector, axisVector, a),
				rotateVector(f.triangle.b, anchorVector, axisVector, a),
				rotateVector(f.triangle.c, anchorVector, axisVector, a)
			)
		}))
	}));

	return { bands };
};

const rotateVector = (
	startingVector: Vector3,
	anchor: Vector3,
	axis: Vector3,
	angle: number
): Vector3 => {
	const vector = startingVector.clone();
	vector.addScaledVector(anchor, -1);
	vector.applyAxisAngle(axis, angle);
	vector.addScaledVector(anchor, 1);
	return vector;
};

export const getRecurrences = (recurs: Recurrence | undefined): number[] => {
	if (typeof recurs === 'number') {
		const recurrences = new Array(recurs);
		return recurrences.fill(0).map((_value, index) => index);
	} else if (Array.isArray(recurs)) {
		return recurs;
	}
	return [1];
};

export const generateTransformedGlobules = (
	prototype: Globule,
	transforms: ChainableTransform[]
): Globule[] => {
	const globules: Globule[] = [prototype];
	transforms.forEach(({ recurs, ...transform }, transformIndex) => {
		const recurrences = getRecurrences(recurs);
		const existingCount = globules.length;
		recurrences.forEach((multiplier, recurrenceIndex) => {
			for (let i = 0; i < existingCount; i++) {
				const index = recurrenceIndex * existingCount + i;
				globules[index] = {
					...globules[i],
					data: transformMutableGlobuleData(
						cloneGlobuleData(globules[i].data),
						transform,
						multiplier
					)
				};
			}
		});
	});
	return globules;
};
