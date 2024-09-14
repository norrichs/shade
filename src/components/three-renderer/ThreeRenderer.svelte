<script lang="ts">
	import { Canvas } from '@threlte/core';
	import Scene from './Scene.svelte';
	import type { Band, Level, Strut } from '$lib/types';

	export let levels: Level[] = [];
	export let bands: Band[] = [];
	export let struts: Strut[] = [];
</script>

<Canvas size={{ width: 1000, height: 1000 }}>
	<Scene {levels} {bands} {struts} />
</Canvas>
