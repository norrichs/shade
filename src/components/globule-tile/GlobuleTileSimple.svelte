<script lang="ts">
	import { Canvas } from '@threlte/core';
	import type { Snippet } from 'svelte';

	let { size = 200, children }: { size?: number; children: Snippet } = $props();
</script>

<div>
	<Canvas size={{ width: size, height: size }}>
		{@render children()}
	</Canvas>
</div>
