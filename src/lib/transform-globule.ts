import { Triangle, Vector3 } from 'three';
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
	Globule,
	GlobuleReflect,
	GlobuleScale,
	RecombinatoryRecurrence
} from './types';
import { cloneGlobuleData } from './generate-superglobule';

const defaultRecurrences: RecombinatoryRecurrence[] = [{ multiplier: 1 }];

const constants = {
	rotate: {
		title: 'Rotation',
		defaultTransform: {
			recurs: defaultRecurrences,
			rotate: { axis: { x: 0, y: 0, z: 1 }, anchor: { x: 0, y: 0, z: 0 }, angle: 0 }
		}
	},
	translate: {
		title: 'Translation',
		defaultTransform: { recurs: defaultRecurrences, translate: { x: 0, y: 0, z: 0 } }
	},
	scale: {
		title: 'Scale',
		defaultTransform: {
			recurs: defaultRecurrences,
			scale: { anchor: { x: 0, y: 0, z: 0 }, scaleValue: 1 }
		}
	},
	reflect: {
		title: 'Reflect',
		defaultTransform: {
			recurs: defaultRecurrences,
			reflect: { normal: { x: 0, y: 0, z: 1 }, anchor: { x: 0, y: 0, z: 0 } }
		}
	}
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
): tx is GlobuleTransformTranslate => typeof tx === 'object' && Object.hasOwn(tx, 'translate');
export const isGlobuleTransformRotate = (tx: GlobuleTransform): tx is GlobuleTransformRotate =>
	typeof tx === 'object' && Object.hasOwn(tx, 'rotate');
export const isGlobuleTransformReflect = (tx: GlobuleTransform): tx is GlobuleTransformReflect =>
	typeof tx === 'object' && Object.hasOwn(tx, 'reflect');
export const isGlobuleTransformScale = (tx: GlobuleTransform): tx is GlobuleTransformScale =>
	typeof tx === 'object' && Object.hasOwn(tx, 'scale');

export const transformMutableGlobuleData = (
	globuleData: GlobuleData,
	transform: GlobuleTransform,
	multiplier = 1
): GlobuleData => {
	if (isGlobuleTransformTranslate(transform)) {
		return translateMutableGlobule(globuleData, transform.translate, multiplier);
	} else if (isGlobuleTransformRotate(transform)) {
		return rotateMutableGlobule(globuleData, transform.rotate, multiplier);
	} else if (isGlobuleTransformReflect(transform)) {
		return reflectMutableGlobuleMaintainFacetOrientation(
			globuleData,
			transform.reflect,
			multiplier
		);
	} else if (isGlobuleTransformScale(transform)) {
		return scaleMutableGlobule(globuleData, transform.scale, multiplier);
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

const reflectMutableGlobule = (
	globuleData: GlobuleData,
	{ anchor, normal }: GlobuleReflect,
	multiplier: number
): GlobuleData => {
	const anchorVector = new Vector3(anchor.x, anchor.y, anchor.z);
	const normalVector = new Vector3(normal.x, normal.y, normal.z);
	let bands: Band[] = globuleData.bands;
	if (multiplier === 0) {
		return { bands };
	}
	bands = bands.map((band: Band) => ({
		...band,
		facets: band.facets.map((f: Facet) => ({
			...f,
			triangle: f.triangle.set(
				reflectVector(f.triangle.a, anchorVector, normalVector),
				reflectVector(f.triangle.b, anchorVector, normalVector),
				reflectVector(f.triangle.c, anchorVector, normalVector)
			)
		}))
	}));
	return { bands };
};

const reflectMutableGlobuleMaintainFacetOrientation = (
	globuleData: GlobuleData,
	{ anchor, normal }: GlobuleReflect,
	multiplier: number
): GlobuleData => {
	const anchorVector = new Vector3(anchor.x, anchor.y, anchor.z);
	const normalVector = new Vector3(normal.x, normal.y, normal.z);
	let bands: Band[] = globuleData.bands;
	if (multiplier === 0) {
		return { bands };
	}
	bands = bands.map((band: Band) => {
		const reflectedFacets: Facet[] = new Array(band.facets.length);
		for (let i = 0; i < band.facets.length; i += 2) {
			reflectedFacets[i] = {
				...band.facets[i],
				triangle: new Triangle(
					reflectVector(band.facets[i].triangle.b, anchorVector, normalVector),
					reflectVector(band.facets[i].triangle.a, anchorVector, normalVector),
					reflectVector(band.facets[i + 1].triangle.a, anchorVector, normalVector)
				)
			};
			reflectedFacets[i + 1] = {
				...band.facets[i + 1],
				triangle: new Triangle(
					reflectVector(band.facets[i + 1].triangle.b, anchorVector, normalVector),
					reflectVector(band.facets[i + 1].triangle.a, anchorVector, normalVector),
					reflectVector(band.facets[i].triangle.a, anchorVector, normalVector)
				)
			};
		}

		return {
			...band,
			facets: reflectedFacets.reverse()
		};
	});
	return { bands };
};

const reflectVector = (startingVector: Vector3, anchor: Vector3, normal: Vector3) => {
	const vector = startingVector.clone();
	vector.addScaledVector(anchor, -1);
	vector.reflect(normal);
	vector.addScaledVector(anchor, 1);
	return vector;
};

export const scaleMutableGlobule = (
	globuleData: GlobuleData,
	{ anchor, scaleValue }: GlobuleScale,
	multiplier: number
): GlobuleData => {
	const anchorVector = new Vector3(anchor.x, anchor.y, anchor.z);
	let bands: Band[] = globuleData.bands;
	if (multiplier === 0) {
		return { bands };
	}
	bands = bands.map((band: Band) => ({
		...band,
		facets: band.facets.map((f: Facet) => ({
			...f,
			triangle: f.triangle.set(
				scaleVector(f.triangle.a, anchorVector, scaleValue * multiplier),
				scaleVector(f.triangle.b, anchorVector, scaleValue * multiplier),
				scaleVector(f.triangle.c, anchorVector, scaleValue * multiplier)
			)
		}))
	}));
	return { bands };
};

const scaleVector = (startingVector: Vector3, anchor: Vector3, value: number) => {
	const vector = startingVector.clone();
	vector.addScaledVector(anchor, -1);
	vector.setLength(vector.length() * value);
	vector.addScaledVector(anchor, 1);
	return vector;
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

const isRecombinatoryRecurrence = (recurs?: Recurrence): recurs is RecombinatoryRecurrence[] => {
	return (
		Array.isArray(recurs) && typeof recurs[0] !== 'number' && Object.hasOwn(recurs[0], 'multiplier')
	);
};

export const getRecurrences = (recurs: Recurrence | undefined): RecombinatoryRecurrence[] => {
	if (typeof recurs === 'number') {
		const recurrences = new Array(recurs);
		return recurrences.fill(0).map((_value, index) => ({ multiplier: index }));
	} else if (isRecombinatoryRecurrence(recurs)) {
		return window.structuredClone(recurs);
	} else if (typeof recurs !== 'undefined') {
		return recurs?.map((recurrence) => ({ multiplier: recurrence }));
	}
	return [{ multiplier: 1 }];
};

const isVisible = (recurrence: RecombinatoryRecurrence) =>
	recurrence.ghost === false || recurrence.ghost === undefined;

export const generateTransformedGlobules = (
	prototypeGlobule: Globule,
	transforms: ChainableTransform[]
): Globule[] => {
	console.debug('generateTransformedGlobules');
	const globules: Globule[][] = [[{ ...prototypeGlobule, visible: true }]];
	transforms.forEach(({ recurs, ...transform }, transformIndex) => {
		globules.push([]);
		const recurrences = getRecurrences(recurs);
		recurrences.forEach((recurrence, recurrenceIndex) => {
			globules[transformIndex].forEach((parentGlobule) => {
				const newCoord = {
					s: parentGlobule.coord.s,
					t: transformIndex,
					r: recurrenceIndex
				};

				globules[transformIndex + 1].push({
					...parentGlobule,
					coord: newCoord,
					coordStack: [...parentGlobule.coordStack, newCoord],
					address: {
						s: parentGlobule.address.s,
						g: [...parentGlobule.address.g, recurrenceIndex],
						b: undefined
					},
					data: transformMutableGlobuleData(
						cloneGlobuleData(parentGlobule.data),
						transform,
						recurrence.multiplier
					),
					name: `${parentGlobule.name} [t:${transformIndex} r:${recurrenceIndex} ${isVisible(
						recurrence
					)}]`,
					visible: [parentGlobule.visible, isVisible(recurrence)].reduce(
						(prev, curr) => prev && curr
					),
					recombination: recurrence.recombines
				});
			});
		});
	});

	console.debug(
		'GLOBULES',
		globules[globules.length - 1].map((g) => g.name)
	);
	return globules[globules.length - 1];
};
