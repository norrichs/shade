<script lang="ts">
	import { T } from '@threlte/core';
	import { patternOnModelStore } from '#lib/stores/patternOnModelStore.js';

	// The interior light (PatternOnModel) wants a dark room: the shade should
	// read by its own glow and the lattice it throws on the walls.
	let dim = $derived($patternOnModelStore.enabled && $patternOnModelStore.interiorLight);
</script>

<T.DirectionalLight castShadow position={[3, 10, 10]} intensity={dim ? 0 : 1} />
<T.DirectionalLight position={[-3, 10, -10]} intensity={dim ? 0 : 0.8} />
<T.AmbientLight intensity={dim ? 0.06 : 0.8} />
