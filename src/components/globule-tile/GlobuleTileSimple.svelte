<script lang="ts">
	import type { GlobuleConfig } from '$lib/types';
	import { Canvas, T } from '@threlte/core';
	import GlobuleMesh from '../globuleMesh/GlobuleMesh.svelte';
	import DesignerCamera from '../three-renderer-v2/DesignerCamera.svelte';
	import DesignerLighting from '../three-renderer-v2/DesignerLighting.svelte';
	import { generateGlobuleGeometry } from '$lib/generate-globulegeometry';

	export let size: number = 200;
	export let globuleConfig: GlobuleConfig;

	$: globuleGeometry = generateGlobuleGeometry(globuleConfig);
</script>

<div>
	<Canvas size={{ width: size, height: size }}>
		<DesignerCamera />
		<DesignerLighting />
		<T.Group position={[0, 0, 0]}>
			<GlobuleMesh {globuleGeometry} selected={false} />
		</T.Group>
	</Canvas>
</div>
