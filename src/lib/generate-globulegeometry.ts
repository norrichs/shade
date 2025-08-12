import type { Vector3 } from 'three';
import { generateGlobuleData } from './generate-shape';
import { generateTempId } from './id-handler';
import type {
	BandConfigCoordinates,
	BandGeometry,
	Facet,
	Globule,
	GlobuleConfig,
	GlobuleGeometry,
	Point3,
	SubGlobule,
	SuperGlobule,
	SuperGlobuleGeometry
} from './types';

export const getBandPoints = (facets: Facet[]) =>
	facets.map((f) => [f.triangle.a.clone(), f.triangle.b.clone(), f.triangle.c.clone()]).flat(1);

export const getTabPoints = (facets: Facet[]) => {
	facets
		.map((facet) => {
			if (facet.tab && facet.tab.style === 'full') {
				const { a, b, c } = facet.tab.outer;
				return [a.clone(), b.clone(), c.clone()];
			} else if (
				facet.tab &&
				['trapezoid', 'multi-facet-full', 'multi-facet-trap'].includes(facet.tab.style)
			) {
				const { a, b, c, d } = facet.tab.outer;
				return [a.clone(), b.clone(), c.clone(), a.clone(), c.clone(), d.clone()];
			}
			return [];
		})
		.flat(1);
};

export const generateSuperGlobuleGeometry = (superGlobule: SuperGlobule): SuperGlobuleGeometry => {
	const globules: GlobuleGeometry[] = [];
	superGlobule.subGlobules.forEach((subGlobule: SubGlobule) => {
		const { data } = subGlobule;
		data.forEach((globule: Globule) => {
			globules.push(generateGlobuleGeometry(globule));
		});
	});
	return {
		type: 'SuperGlobuleGeometry',
		variant: 'Globule',
		superGlobuleConfigId: superGlobule.superGlobuleConfigId,
		name: superGlobule.name,
		subGlobules: globules
	};
};

export const generateSuperGlobuleBandGeometry = (
	superGlobule: SuperGlobule
): SuperGlobuleGeometry => {
	const globules: BandGeometry[][] = [];
	superGlobule.subGlobules.forEach((subGlobule: SubGlobule) => {
		const { data } = subGlobule;
		data.forEach((globule: Globule, index: number) => {
			globules.push(generateBandGeometry(globule, index));
		});
	});
	return {
		type: 'SuperGlobuleGeometry',
		variant: 'Band',
		superGlobuleConfigId: superGlobule.superGlobuleConfigId,
		name: superGlobule.name,
		subGlobules: globules
	};
};

export const generateBandGeometry = (globule: Globule, globuleIndex: number): BandGeometry[] => {
	const bandGeometry = globule.data.bands
		.filter((b) => b.visible)
		.map((band, bandIndex): BandGeometry => {
			return {
				type: 'BandGeometry',
				coord: { ...globule.coord, b: bandIndex } as BandConfigCoordinates,
				coordStack: globule.coordStack,
				address: { ...globule.address, b: bandIndex },
				name: `${globule.name}-band-${bandIndex}`,
				globuleConfigId: globule.globuleConfigId,
				subGlobuleConfigId: globule.subGlobuleConfigId,
				points: getBandPoints(band.facets),
				globuleIndex,
				bandIndex
			};
		});
	return bandGeometry;
};

export const generateGlobuleGeometry = (globule: Globule | GlobuleConfig): GlobuleGeometry => {
	if (globule.type === 'Globule') {
		const points = globule.data.bands.map((band) => getBandPoints(band.facets)).flat();
		return {
			type: 'GlobuleGeometry',
			name: globule.name,
			subGlobuleConfigId: globule.subGlobuleConfigId || generateTempId('sub'),
			subGlobuleRecurrence: globule.recurrence,
			globuleConfigId: globule.globuleConfigId,
			points
		};
	} else {
		const { bands } = generateGlobuleData(globule);
		const points = bands.map((band) => getBandPoints(band.facets)).flat();
		return {
			type: 'GlobuleGeometry',
			name: globule.name,
			subGlobuleConfigId: generateTempId('sub'),
			subGlobuleRecurrence: 1,
			globuleConfigId: globule.id,
			points
		};
	}
};

export const getNearestPoint = (point: Vector3, globule: GlobuleGeometry | BandGeometry) => {
	let closest = { point: globule.points[0], distance: globule.points[0].distanceTo(point) };
	globule.points.forEach((p) => {
		const distance = p.distanceTo(point);
		if (distance < closest.distance) {
			closest = { point: p, distance };
		}
	});
	return closest.point;
};
