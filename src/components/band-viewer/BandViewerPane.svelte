<script lang="ts">
	import ThreeRenderer from '../three-renderer/ThreeRenderer.svelte';
	import BandViewerScene from './BandViewerScene.svelte';
	import {
		assemblerHighlight,
		patternBandSpaces,
		superGlobuleStore,
		tubesForGeometrySource
	} from '#lib/stores/index.js';
	import { resolveHighlightedBand } from '#lib/band-viewer/resolve-band.js';
	import { prepareUnfold } from '#lib/band-viewer/unfold-band.js';

	/** Flatten amount, percent. Kept across band changes so bands compare at one unfold. */
	let percent = $state(0);

	const resolved = $derived.by(() => {
		const sg = $superGlobuleStore;
		try {
			return resolveHighlightedBand(
				$assemblerHighlight,
				(source, globule) => tubesForGeometrySource(sg, source, globule),
				$patternBandSpaces
			);
		} catch (e) {
			console.warn('Band viewer: failed to resolve the highlighted band', e);
			return null;
		}
	});

	// Re-prepared whenever the resolved band object changes (selection or regeneration).
	const plan = $derived(resolved ? prepareUnfold(resolved.band) : null);
</script>

<div class="band-viewer">
	<header>
		{#if resolved}
			<span class="label">Band {resolved.label}</span>
		{:else}
			<span class="hint">Select a band</span>
		{/if}
	</header>
	<div class="viewport">
		<ThreeRenderer agentCapture={false} pointPick={false}>
			{#if plan && resolved}
				<BandViewerScene {plan} flatten={percent / 100} frameKey={resolved.key} />
			{/if}
		</ThreeRenderer>
	</div>
	<footer>
		<label>
			<span>Flatten</span>
			<input
				type="range"
				min="0"
				max="100"
				step="0.1"
				bind:value={percent}
				disabled={!plan}
				aria-label="Flatten amount"
			/>
			<output>{percent.toFixed(1)}%</output>
		</label>
	</footer>
</div>

<style>
	.band-viewer {
		height: 100%;
		display: flex;
		flex-direction: column;
	}
	header,
	footer {
		flex: none;
		padding: 4px 8px;
		font-size: 0.85rem;
	}
	.hint {
		opacity: 0.6;
	}
	.viewport {
		flex: 1 1 auto;
		min-height: 0;
	}
	footer label {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	footer input {
		flex: 1 1 auto;
		min-width: 0;
	}
	footer output {
		flex: none;
		width: 4.5em;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
