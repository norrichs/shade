import type { ComponentType, SvelteComponent } from 'svelte';
import CrossSection from './editor/CrossSection.svelte';
import EdgeCurve from './editor/EdgeCurve.svelte';
import Polyhedra from './editor/Polyhedra.svelte';

export type FloaterContent = {
  shortTitle: string;
  title: string | string[];
  content: ComponentType<SvelteComponent>;
};

export type SidebarDefinition = Map<FloaterContent['title'], FloaterContent>

export const projectionConfigs: SidebarDefinition = new Map([
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
  ]
]);