<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { degToRad } from '$lib/patterns/utils';
</script>

<T.PerspectiveCamera makeDefault position={[0, 2000, -5]} fov={30} near={1} far={10000}>
	<OrbitControls maxPolarAngle={degToRad(160)} enableZoom={true} target={[0, 0.5, 0]} />
</T.PerspectiveCamera>
