<script lang="ts">
	import { Canvas } from '@threlte/core';
	import PointPick from './PointPick.svelte';
</script>

<div class="container">
	<PointPick />
	<Canvas size={{ width: 1000, height: 1000 }}>
		<slot />
	</Canvas>
</div>

<style>
	.container {
		position: relative;
	}

</style>
