<script lang="ts">
	import { useThrelte } from '@threlte/core';
	import { registerModelCapture } from '$lib/agent-bridge/capture';

	// Render and read back in one task: the canvas has no preserveDrawingBuffer,
	// so its pixels are gone once the frame is presented.
	const { renderer, scene, camera } = useThrelte();

	$effect(() =>
		registerModelCapture(() => {
			renderer.render(scene, camera.current);
			return renderer.domElement.toDataURL('image/png');
		})
	);
</script>
