<script lang="ts">
	import { Canvas } from '@threlte/core';
	import PointPick from './PointPick.svelte';
</script>

<div class="container">
	<PointPick />
	<Canvas >
		<slot />
	</Canvas>
</div>

<style>
	.container {
		position: relative;
		border: 1px solid grey;
		background-color: beige;
		height: 100%;
	}

</style>
