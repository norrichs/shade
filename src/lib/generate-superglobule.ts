import { Vector3 } from 'three';
import { generateGlobuleData } from './generate-shape';
import type {
	Band,
	Facet,
	Globule,
	GlobuleData,
	GlobuleRotate,
	GlobuleTransform,
	Point3,
	Recurrence,
	SubGlobule,
	SubGlobuleConfig,
	SuperGlobule,
	SuperGlobuleConfig
} from './types';

export const generateSuperGlobule = (superConfig: SuperGlobuleConfig): SuperGlobule => {
	const subGlobules = superConfig.subGlobuleConfigs.map((sgc) => generateSubGlobule(sgc)).flat();

	return {
		type: 'SuperGlobule',
		superGlobuleConfigId: superConfig.id,
		name: superConfig.name,
		subGlobules
	};
};

const generateRecurrences = (recurs: Recurrence): number[] => {
	if (typeof recurs === 'number') {
		const recurrences = new Array(recurs);
		return recurrences.fill(0).map((_value, index) => index);
	}
	return [...recurs];
};

const generateSubGlobule = (
	subGlobuleConfig: SubGlobuleConfig,
	recurrenceIndex?: number
): SubGlobule => {
	const { transform, id, name } = subGlobuleConfig;

	const globules: Globule[] = [];
	// if (subGlobuleConfig.globuleConfig.type === 'GlobuleConfig') {
	const globuleData = generateGlobuleData(subGlobuleConfig.globuleConfig);

	generateRecurrences(transform.recurs).forEach((recurrence) => {
		globules.push({
			type: 'Globule',
			...(id ? { subGlobuleConfigId: id } : {}),
			...(subGlobuleConfig.globuleConfig.id
				? { globuleConfigId: subGlobuleConfig.globuleConfig.id }
				: {}),
			recurrence,
			name,
			data: transformGlobuleData(globuleData, transform, recurrence)
		} as Globule);
	});

	return {
		type: 'SubGlobule',
		subGlobuleConfigId: id,
		name,
		recurrence: recurrenceIndex || 1,
		data: globules as Globule[]
	};
	// } else {
	// 	// This section needs to be rethought
	// 	//  - is 'transform' to be inherited down to 'GlobuleData'?
	// 	//  - maybe we recursively cover the SuperGlobule tree, pushing references to GlobuleData instances with reduced Transform to an array, then iterate through the array, mutatinging in place
	// 	// Punting for now, only allowing 1 level deep

	// 	for (let recurrence = 0; recurrence < transform.recurs; recurrence += 1) {
	// 		const subGlobule: SubGlobule = {
	// 			type: 'SubGlobule',
	// 			...(id ? { subGlobuleConfigId: id } : {}),
	// 			// ...(subGlobuleConfig.globuleConfig.id ? { globuleConfigId: subGlobuleConfig.globuleConfig.id } : {}),
	// 			recurrence: recurrence as Recurrence,
	// 			name,
	// 			data: [
	// 				transformSubGlobuleData(
	// 					transform,
	// 					subGlobuleConfig.globuleConfig.transform,
	// 					recurrence as Recurrence
	// 				)
	// 			]
	// 		};
	// 		(globules as SubGlobule[]).push(subGlobule);
	// 	}
	// 	return {
	// 		type: 'SubGlobule',
	// 		subGlobuleConfigId: id,
	// 		name,
	// 		recurrence: recurrenceIndex || 1,
	// 		data: globules as SubGlobule[]
	// 	};
	// }
};

// does not mutate globule
const transformGlobuleData = (
	globule: GlobuleData,
	transform: GlobuleTransform,
	iteration: number
): GlobuleData => {
	let transformedGlobule: GlobuleData = cloneGlobuleData(globule);
	if (transform.rotate) {
		transformedGlobule = rotateMutableGlobule(transformedGlobule, transform.rotate, iteration);
	}
	if (transform.translate) {
		transformedGlobule = translateMutableGlobule(
			transformedGlobule,
			transform.translate,
			iteration
		);
	}

	return transformedGlobule;
};

// mutates globuleData
const translateMutableGlobule = (
	globuleData: GlobuleData,
	point: Point3,
	multiplier: number
): GlobuleData => {
	const translationVector = new Vector3(point.x, point.y, point.z);

	const bands = globuleData.bands.map((band: Band) => ({
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

	const bands = globuleData.bands.map((band: Band) => ({
		...band,
		facets: band.facets.map((f: Facet) => ({
			...f,
			triangle: f.triangle.set(
				rotateVector(f.triangle.a, anchorVector, axisVector, angle * multiplier),
				rotateVector(f.triangle.b, anchorVector, axisVector, angle * multiplier),
				rotateVector(f.triangle.c, anchorVector, axisVector, angle * multiplier),
			)
		}))
	}))

	return { bands };
};

const rotateVector = (startingVector: Vector3, anchor: Vector3, axis: Vector3, angle: number): Vector3 => {
	const vector = startingVector.clone();
	vector.addScaledVector(anchor, 1)
	vector.applyAxisAngle(axis, angle)
	vector.addScaledVector(anchor, -1)
	return vector
}


const cloneGlobuleData = (globuleData: GlobuleData): GlobuleData => {
	return { bands: globuleData.bands.map((b) => cloneBand(b)) };
};

const cloneBand = (band: Band): Band => {
	return {
		...band,
		facets: band.facets.map((f) => cloneFacet(f))
	};
};

// tab clone not yet implemented
const cloneFacet = (facet: Facet) => {
	return { triangle: facet.triangle.clone() };
};
