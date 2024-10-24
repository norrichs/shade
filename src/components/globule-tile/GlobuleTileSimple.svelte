<script lang="ts">
	import { Canvas } from '@threlte/core';
	export let size: number = 200;
</script>

<div>
	<Canvas size={{ width: size, height: size }}>
		<slot />
	</Canvas>
</div>
