<script lang="ts">
	import { show_svg } from '$lib/util';
	// @ts-expect-error
	import outline from 'svg-path-outline';
	import PatternLabel from '../../components/cut-pattern/PatternLabel.svelte';

	const getPath = () => {
		const rawPathString = `M 0 0 L 100 0 L 100 100 L 0 100 Z`;
		const pathString = outline(rawPathString, 20, {
			joints: 0,
			bezierAccuracy: 0.5,
			inside: true,
			outside: true,
			tagName: 'path'
		});
		return pathString;
	};
</script>

<section>
	<button on:click={() => show_svg('test-svg')}> Download </button>
	<svg id="test-svg" width={2000} height={500} viewBox="0 -250 2000 500">
		{#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as i}
			<g transform={`translate(${120 * i})`}>
				<PatternLabel value={i} />
			</g>
		{/each}
	</svg>
</section>

<style>
	svg {
		background-color: dimgray;
	}
</style>
