<script lang="ts">
	/**
	 * Translate / Scale / Rotate editors for a `TransformConfig`.
	 *
	 * Shared by the Surface and Polyhedra panels so the two cannot drift apart.
	 * Binds straight through to the caller's config object, matching how the
	 * Surface panel already wired Translate and Scale.
	 *
	 * Callers must pass a materialised transform — see `materializeTransform` in
	 * `./transform-config`. A `'inherit'` transform has nothing to bind to.
	 */
	import type { TransformConfig } from '$lib/projection-geometry/types';
	import LabeledControl from './LabeledControl.svelte';
	import PointInput from '../../controls/super-control/PointInput.svelte';

	let { transform = $bindable() }: { transform: TransformConfig } = $props();
</script>

<LabeledControl label="Translate">
	<PointInput bind:value={transform.translate} />
</LabeledControl>
<LabeledControl label="Scale">
	<PointInput bind:value={transform.scale} />
</LabeledControl>
<LabeledControl label="Rotate">
	<PointInput bind:value={transform.rotate} />
</LabeledControl>
