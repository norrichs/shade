import type { ComponentType, SvelteComponent } from 'svelte';
import CrossSection from './editor/CrossSection.svelte';
import EdgeCurve from './editor/EdgeCurve.svelte';
import Polyhedra from './editor/Polyhedra.svelte';
import Surface from './editor/Surface.svelte';
import PatternView from './editor/PatternView.svelte';
import Utilities from './editor/Utilities.svelte';

export type FloaterContent = {
  shortTitle: string;
  title: string | string[];
  content: ComponentType<SvelteComponent>;
};

export type SidebarDefinition = Map<FloaterContent['title'], FloaterContent>

export const utilities: SidebarDefinition = new Map([
  [
    'Utilities',
    {
      shortTitle: 'UT',
      title: 'Utilities',
      content: Utilities
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
  ]
]);

export const projectionConfigs: SidebarDefinition = new Map([
  ...utilities,
  ...patternConfigs,
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
      shortTitle: "Su",
      title: "Surface",
      content: Surface
    }
  ]
]);