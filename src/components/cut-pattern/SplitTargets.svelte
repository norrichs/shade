<script lang="ts">
	import { splitBoundariesOfBand } from '$lib/cut-pattern/split-boundaries';
	import type { BandCutPattern } from '$lib/types';

	let {
		band,
		subunitCount = 1,
		splitQuads = [],
		interactive = false,
		onToggle
	}: {
		band: BandCutPattern;
		subunitCount?: number;
		/** Absolute (parent) quad indices split on this band's tube. */
		splitQuads?: number[];
		/** Split mode is on: every legal boundary gets a hit target. */
		interactive?: boolean;
		onToggle: (quad: number) => void;
	} = $props();

	/**
	 * All legal boundaries while placing splits; outside split mode only the
	 * boundaries that ARE splits, so piece divisions stay visible at all times
	 * (design L425-426) without adding per-quad DOM to the default view.
	 *
	 * `quad` is an absolute parent quad index, which is what a split is stored
	 * as — so a piece's own leading seam toggles the split that created it.
	 */
	const boundaries = $derived(
		!interactive && splitQuads.length === 0
			? // The overwhelmingly common case: no split mode, no splits on this
				// tube, so there is nothing to draw and nothing to walk the band for.
				[]
			: splitBoundariesOfBand(band, subunitCount, splitQuads).filter(
					(boundary) => interactive || boundary.isSplit
				)
	);
</script>

{#each boundaries as boundary (boundary.quad)}
	<g class="split-target" class:active={boundary.isSplit}>
		<!-- Visible hairline -->
		<line
			x1={boundary.from.x}
			y1={boundary.from.y}
			x2={boundary.to.x}
			y2={boundary.to.y}
			class="hairline"
		/>
		{#if interactive}
			<!-- Fat invisible hit target. stopPropagation keeps BandComponent's
			     band-level onclick from also firing and selecting the band. -->
			<line
				x1={boundary.from.x}
				y1={boundary.from.y}
				x2={boundary.to.x}
				y2={boundary.to.y}
				class="hit"
				stroke-width={boundary.hitWidth}
				role="button"
				aria-label={`${boundary.isSplit ? 'Remove' : 'Place'} split at quad ${boundary.quad}`}
				tabindex="0"
				onclick={(e) => {
					e.stopPropagation();
					onToggle(boundary.quad);
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						e.stopPropagation();
						onToggle(boundary.quad);
					}
				}}
			/>
		{/if}
	</g>
{/each}

<style>
	.hairline {
		stroke: #888;
		stroke-width: 1;
		stroke-dasharray: 4 3;
		pointer-events: none;
	}
	.split-target.active .hairline {
		stroke: #d33;
		stroke-width: 2;
		stroke-dasharray: none;
	}
	/* Width is per boundary (see `hitWidth`), set inline: bands taper, and a
	   fixed zone overlaps its neighbours where the quads get short. */
	.hit {
		stroke: transparent;
		cursor: pointer;
	}
</style>
