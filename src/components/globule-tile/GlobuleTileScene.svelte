<script lang="ts">
	import { generateGlobuleGeometry } from '$lib/generate-globulegeometry';
	import { selectedGlobule } from '$lib/stores';
	import { get } from 'svelte/store';
	import type { GlobuleConfig } from '$lib/types';
	import { T } from '@threlte/core';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';
	import DesignerCamera from '../three-renderer/DesignerCamera.svelte';
	import DesignerLighting from '../three-renderer/DesignerLighting.svelte';
	import { interactivity } from '@threlte/extras';

	interactivity();

	let { globuleConfig, sgIndex, selected = false }: { globuleConfig: GlobuleConfig; sgIndex: number; selected?: boolean } = $props();
	const CLICK_DELTA_THRESHOLD = 10;

	const handleClick = (event: any) => {
		event.stopPropagation();
		if (event.delta > CLICK_DELTA_THRESHOLD) return;
		selectedGlobule.set({ subGlobuleConfigIndex: sgIndex, globuleId: globuleConfig.id });
	};

	let globuleGeometry = $derived(generateGlobuleGeometry(globuleConfig));
</script>

<DesignerCamera />
<DesignerLighting />
<T.Group position={[0, 0, 0]} onclick={(ev) => handleClick(ev)}>
	<GlobuleMesh geometry={globuleGeometry} material={selected ? 'selected' : 'default'} />
</T.Group>
