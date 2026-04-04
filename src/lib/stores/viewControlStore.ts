import { AUTO_PERSIST_KEY, bootstrapShouldUsePersisted, persistable } from '$lib/persistable';
import { loadPersistedOrDefault } from './stores';

export type ShowProjectionGeometries = {
	[key: string]: boolean;
	any: boolean;
	surface: boolean;
	polygons: boolean;
	projection: boolean;
	surfaceProjection: boolean;
	sections: boolean;
	bands: boolean;
};

export type ShowGlobuleGeometries = {
	[key: string]: boolean;
	any: boolean;
};
export type ShowGlobuleTubeGeometries = {
	[key: string]: boolean;
	any: boolean;
	bands: boolean;
	facets: boolean;
	sections: boolean;
};

export type ViewControls = {
	showProjectionGeometry: ShowProjectionGeometries;
	showGlobuleGeometry: ShowGlobuleGeometries;
	showGlobuleTubeGeometry: ShowGlobuleTubeGeometries;
};

const defaultViewControls = (): ViewControls => ({
	showProjectionGeometry: {
		any: true,
		surface: false,
		polygons: false,
		projection: false,
		surfaceProjection: true,
		sections: false,
		bands: false,
		facets: false
	},
	showGlobuleGeometry: {
		any: false
	},
	showGlobuleTubeGeometry: {
		any: false,
		bands: true,
		facets: false,
		sections: false
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
