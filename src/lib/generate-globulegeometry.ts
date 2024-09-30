import { generateGlobuleData } from './generate-shape';
import { generateTempId } from './id-handler';
import type {
	Facet,
	Globule,
	GlobuleConfig,
	GlobuleGeometry,
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
		superGlobuleConfigId: superGlobule.superGlobuleConfigId,
		name: superGlobule.name,
		subGlobules: globules
	};
};

export const generateGlobuleGeometry = (globule: Globule | GlobuleConfig): GlobuleGeometry => {
	console.debug('generateGlobuleGeometry', { globule });
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
