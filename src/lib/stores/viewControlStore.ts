import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { loadPersistedOrDefault } from './stores';

export type ShowProjectionGeometries = {
	[key: string]: boolean;
	any: boolean;
	surface: boolean;
	polygons: boolean;
	projection: boolean;
	sections: boolean;
	bands: boolean;
};

export type ShowGlobuleGeometries = {
	[key: string]: boolean;
	any: boolean;
};
export type ViewControls = {
	showProjectionGeometry: ShowProjectionGeometries;
	showGlobuleGeometry: ShowGlobuleGeometries;
};

const defaultViewControls = (): ViewControls => ({
	showProjectionGeometry: {
		any: true,
		surface: false,
		polygons: true,
		projection: false,
		sections: false,
		bands: false,
		facets: false
	},
	showGlobuleGeometry: {
		any: false
	}
});

export const viewControlStore = persistable<ViewControls>(
	((): ViewControls => {
		const config = loadPersistedOrDefault(bootstrapShouldUsePersisted(), defaultViewControls);
		return config;
	})(),
	'ViewControlConfig',
	AUTO_PERSIST_KEY,
	bootstrapShouldUsePersisted()
);
