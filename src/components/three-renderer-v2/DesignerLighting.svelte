<script lang="ts">
	import { T } from '@threlte/core';
</script>

<T.DirectionalLight castShadow position={[3, 10, 10]} />
<T.DirectionalLight position={[-3, 10, -10]} intensity={0.8} />
<T.AmbientLight intensity={0.8} />
