import type { Component } from 'svelte';
import CrossSection from './editor/CrossSection.svelte';
import EdgeCurve from './editor/EdgeCurve.svelte';
import Polyhedra from './editor/Polyhedra.svelte';
import Surface from './editor/Surface.svelte';
import PatternView from './editor/PatternView.svelte';
import Utilities from './editor/Utilities.svelte';
import Silhouette from './editor/Silhouette.svelte';
import GlobuleCrossSection from './editor/GlobuleCrossSection.svelte';
import PatternScale from './editor/PatternScale.svelte';
import Selection from './editor/Selection.svelte';
import ConfigManager from './editor/ConfigManager.svelte';

export type FloaterContent = {
	shortTitle: string;
	title: string | string[];
	content: Component;
};

export type SidebarDefinition = Map<FloaterContent['title'], FloaterContent>;

export const utilities: SidebarDefinition = new Map([
	[
		'Utilities',
		{
			shortTitle: 'UT',
			title: 'Utilities',
			content: Utilities
		}
	],
	[
		'Selection',
		{
			shortTitle: 'SL',
			title: 'Selection',
			content: Selection
		}
	],
	[
		'Configs',
		{
			shortTitle: 'CF',
			title: 'Configs',
			content: ConfigManager
		}
	]
]);

export const patternConfigs: SidebarDefinition = new Map([
	[
		'Pattern',
		{
			shortTitle: 'PV',
			title: 'Pattern View',
			content: PatternView
		}
	],
	[
		'Pattern Scale',
		{
			shortTitle: 'PS',
			title: 'Pattern Scale',
			content: PatternScale
		}
	]
]);

export const globuleConfigs: SidebarDefinition = new Map([
	[
		'Silhouette',
		{
			shortTitle: 'Sl',
			title: 'Silhouette',
			content: Silhouette
		}
	],
	[
		'Globule Cross Section',
		{
			shortTitle: 'GCS',
			title: 'Globule Cross Section',
			content: GlobuleCrossSection
		}
	]
]);

export const projectionConfigs: SidebarDefinition = new Map([
	...utilities,
	...patternConfigs,
	...globuleConfigs,
	[
		'Cross Sections',
		{
			shortTitle: 'CS',
			title: 'Cross Section',
			content: CrossSection
		}
	],
	[
		`Edge Curves`,
		{
			shortTitle: 'Edge',
			title: 'Edge Curve',
			content: EdgeCurve
		}
	],
	[
		'Polyhedra',
		{
			shortTitle: 'Ph',
			title: 'Polyhedra',
			content: Polyhedra
		}
	],
	[
		`Surface`,
		{
			shortTitle: 'Su',
			title: 'Surface',
			content: Surface
		}
	]
]);
