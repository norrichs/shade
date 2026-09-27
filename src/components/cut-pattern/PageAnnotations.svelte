<script lang="ts">
	import type { PagePostProcessResult } from '$lib/cut-pattern/post-process-types';
	import { layerStrokes } from '$lib/stores';
	import SvgText from './SvgText/SvgText.svelte';

	let { result }: { result: PagePostProcessResult } = $props();
</script>

<!-- Stage 3 output, in page space: drawn outside every band group. -->
<g id="page-annotations">
	{#each result.disconnects as d, i (i)}
		<path
			d={`M ${d.a.x} ${d.a.y} L ${d.b.x} ${d.b.y}`}
			data-geometry="surround-disconnect"
			fill="none"
			stroke={$layerStrokes['surround-disconnect']}
			stroke-width={1}
		/>
	{/each}
	{#each result.pageLabels as label, i (i)}
		{#if !label.unplaced}
			<SvgText
				string={label.text}
				anchor={label.origin}
				size={label.size}
				offset={{ x: 0, y: 0 }}
				geometry="page-label"
			/>
		{/if}
	{/each}
</g>
