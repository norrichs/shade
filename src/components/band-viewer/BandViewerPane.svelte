<script lang="ts">
	import ThreeRenderer from '../three-renderer/ThreeRenderer.svelte';
	import BandViewerScene from './BandViewerScene.svelte';
	import BandViewerEditor from './BandViewerEditor.svelte';
	import Floater from '../modal/Floater.svelte';
	import {
		assemblerHighlight,
		bandViewerMaxFacets,
		bandViewerRangeSource,
		bandViewerSelection,
		patternBandSpaces,
		patternSourceStore,
		superGlobuleStore,
		tubesForGeometrySource
	} from '#lib/stores/index.js';
	import { geometrySourceOfPattern } from '#lib/cut-pattern/pattern-band-space.js';
	import { pickRangeSource, resolveViewerBands } from '#lib/band-viewer/resolve-bands.js';
	import { createUnfoldCache } from '#lib/band-viewer/unfold-band.js';
	import type { ResolvedBand } from '#lib/band-viewer/resolve-band.js';
	import type { GeometrySource } from '#lib/stores/selectionStores.js';

	/** Flatten amount, percent. Kept across band changes so bands compare at one unfold. */
	let percent = $state(0);
	let editorOpen = $state(false);

	const tubesOf = $derived((source: GeometrySource, globule: number) =>
		tubesForGeometrySource($superGlobuleStore, source, globule)
	);

	// Range mode ranges over the pattern's source, or the first source with tubes.
	const rangeSource = $derived(
		pickRangeSource(
			geometrySourceOfPattern($patternSourceStore),
			(source) => (tubesOf(source, 0)?.length ?? 0) > 0
		)
	);

	$effect(() => {
		bandViewerRangeSource.set(rangeSource);
	});

	const resolved = $derived.by<ResolvedBand[]>(() => {
		try {
			return resolveViewerBands(
				$bandViewerSelection,
				// Only Selected mode shows the highlight; reading it in the other
				// modes would re-resolve (and rebuild) every shown band on each click.
				$bandViewerSelection.mode === 'selected' ? $assemblerHighlight : null,
				rangeSource,
				tubesOf,
				$patternBandSpaces
			);
		} catch (e) {
			console.warn('Band viewer: failed to resolve the bands to show', e);
			return [];
		}
	});

	const anchor = $derived($bandViewerSelection.anchor);

	// Plans are cached per band object and anchor, and the combined plan is
	// reused while the same plans are shown, so re-resolving unchanged bands
	// rebuilds nothing; regeneration or an anchor change re-prepares.
	const unfoldCache = createUnfoldCache();
	const plan = $derived(
		unfoldCache.multiFor(
			resolved.map((r) => r.band),
			anchor
		)
	);

	// The camera reframes when the SET of shown bands changes, not on anchor or slider.
	const frameKey = $derived(
		resolved
			.map((r) => r.key)
			.sort()
			.join('|')
	);

	$effect(() => {
		bandViewerMaxFacets.set(resolved.reduce((m, r) => Math.max(m, r.band.facets.length), 0));
	});

	const hint = $derived(
		$bandViewerSelection.mode === 'clicked'
			? 'Click bands to add them'
			: $bandViewerSelection.mode === 'range'
				? 'No bands in range'
				: 'Select a band'
	);
</script>

<div class="band-viewer">
	<header>
		{#if resolved.length === 1}
			<span class="label">Band {resolved[0].label}</span>
		{:else if resolved.length > 1}
			<span class="label">{resolved.length} bands</span>
		{:else}
			<span class="hint">{hint}</span>
		{/if}
	</header>
	<div class="viewport">
		<ThreeRenderer agentCapture={false} pointPick={false}>
			{#if plan}
				<BandViewerScene {plan} flatten={percent / 100} {frameKey} />
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
		<button
			class="edit"
			class:active={editorOpen}
			onclick={() => (editorOpen = !editorOpen)}
			title="Choose the bands and anchor facet"
		>
			Edit
		</button>
	</footer>
</div>
<Floater
	title="Band viewer"
	showFloater={editorOpen}
	onClose={() => (editorOpen = false)}
	content={BandViewerEditor}
/>

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
	footer {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	footer label {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	footer input {
		flex: 1 1 auto;
		min-width: 0;
	}
	.edit.active {
		font-weight: bold;
	}
	footer output {
		flex: none;
		width: 4.5em;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
