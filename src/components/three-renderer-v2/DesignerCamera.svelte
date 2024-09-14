<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { degToRad } from '$lib/patterns/utils';
</script>

<T.PerspectiveCamera makeDefault position={[0, 600, -5]} fov={50}>
	<OrbitControls maxPolarAngle={degToRad(160)} enableZoom={true} target={[0, 0.5, 0]} />
</T.PerspectiveCamera>
