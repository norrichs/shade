import { AUTO_PERSIST_KEY, persistable } from '$lib/persistable';

export type ViewModeSetting = 'three' | 'pattern';

export type UISetting = {
	designer: { viewMode: ViewModeSetting };
};

export const uiStore = persistable<UISetting>(
	{ designer: { viewMode: 'three' } },
	'UISettings',
	AUTO_PERSIST_KEY,
	true
);
