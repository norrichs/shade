<script lang="ts">
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import {
		partnerHighlightStore,
		type PartnerHighlightSource
	} from '$lib/stores/partnerHighlightStore';
	import {
		getEligibleBands,
		resolvePair,
		pairsEqual,
		type PartnerMode,
		type ResolvedPair
	} from './partner-pair-resolver';
	import type { BandCutPattern } from '$lib/types';
	import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
	import { onDestroy } from 'svelte';

	let {
		mode,
		onChange
	}: {
		mode: PartnerMode;
		onChange: (snapshot: ResolvedPair | null) => void;
	} = $props();

	type SourcedBand = { source: PartnerHighlightSource; band: BandCutPattern };

	const sourcedBands = $derived.by((): SourcedBand[] => {
		const tubesOf = (raw: any): { bands: BandCutPattern[] }[] | undefined =>
			raw?.projectionCutPattern?.tubes ?? raw?.tubes;
		const fromCut = (raw: any, source: PartnerHighlightSource): SourcedBand[] =>
			tubesOf(raw)?.flatMap((t) => t.bands.map((b) => ({ source, band: b }))) ?? [];
		const fromProjection = fromCut($superGlobulePatternStore?.projectionPattern, 'projection');
		const fromSurface = fromCut($superGlobulePatternStore?.surfaceProjectionPattern, 'surface');
		const fromGlobuleTube = fromCut($superGlobulePatternStore?.globuleTubePattern, 'globuleTube');
		const fromSuper: SourcedBand[] = (
			($superGlobulePatternStore?.superGlobulePattern as any)?.bandPatterns ?? []
		).map((b: BandCutPattern) => ({ source: 'projection' as PartnerHighlightSource, band: b }));
		return [...fromProjection, ...fromSurface, ...fromGlobuleTube, ...fromSuper];
	});

	const bands = $derived(sourcedBands.map((s) => s.band));
	const eligibleSourced = $derived(
		sourcedBands.filter((s) => s.band.meta?.[mode === 'partnerStart' ? 'startPartnerBand' : 'endPartnerBand'])
	);
	const eligible = $derived(eligibleSourced.map((s) => s.band));

	let selectedKey: string = $state('');

	let snapshot: ResolvedPair | null = $state(null);

	// Lookup the source associated with the currently-selected dropdown entry
	const selectedSourcedBand = $derived(eligibleSourced.find((s) => keyForOption(s) === selectedKey));

	const sameSourceBands = $derived(
		selectedSourcedBand
			? sourcedBands.filter((s) => s.source === selectedSourcedBand.source).map((s) => s.band)
			: []
	);

	const livePair = $derived.by((): ResolvedPair | null => {
		if (!selectedSourcedBand) return null;
		return resolvePair(sameSourceBands, selectedSourcedBand.band.address, mode);
	});

	const isStale = $derived.by(() => {
		if (!snapshot) return false;
		if (!livePair) return true; // selected band disappeared
		return !pairsEqual(snapshot, livePair);
	});

	const keyForOption = (s: SourcedBand): string =>
		`${s.source}|${JSON.stringify(s.band.address)}`;
	const labelForOption = (s: SourcedBand): string =>
		`[${s.source}] Tube ${s.band.address.tube} / Band ${s.band.address.band}`;

	const writeHighlight = (sourced: SourcedBand | undefined, fresh: ResolvedPair | null) => {
		if (!sourced || !fresh) {
			partnerHighlightStore.set({ source: 'projection', start: null, end: null });
			return;
		}
		partnerHighlightStore.set({
			source: sourced.source,
			start: mode === 'partnerStart' ? fresh.mainAddress : fresh.ghostAddress,
			end: mode === 'partnerEnd' ? fresh.mainAddress : fresh.ghostAddress
		});
	};

	const handleSelect = (key: string) => {
		selectedKey = key;
		if (!key) {
			snapshot = null;
			onChange(null);
			writeHighlight(undefined, null);
			return;
		}
		const sourced = eligibleSourced.find((s) => keyForOption(s) === key);
		if (!sourced) {
			snapshot = null;
			onChange(null);
			writeHighlight(undefined, null);
			return;
		}
		const sameSource = sourcedBands.filter((s) => s.source === sourced.source).map((s) => s.band);
		const fresh = resolvePair(sameSource, sourced.band.address, mode);
		snapshot = fresh;
		onChange(fresh);
		writeHighlight(sourced, fresh);
	};

	const handleRandom = () => {
		if (eligibleSourced.length === 0) return;
		const random = eligibleSourced[Math.floor(Math.random() * eligibleSourced.length)];
		handleSelect(keyForOption(random));
	};

	const handleClear = () => {
		handleSelect('');
	};

	const handleRefresh = () => {
		if (!selectedSourcedBand) return;
		const fresh = resolvePair(sameSourceBands, selectedSourcedBand.band.address, mode);
		snapshot = fresh;
		onChange(fresh);
		if (!fresh) {
			selectedKey = '';
			writeHighlight(undefined, null);
		} else {
			writeHighlight(selectedSourcedBand, fresh);
		}
	};

	onDestroy(() => {
		partnerHighlightStore.set({ source: 'projection', start: null, end: null });
	});
</script>

<div class="chooser">
	<div class="title">Pair</div>
	{#if eligible.length === 0}
		<div class="empty">
			{bands.length === 0 ? 'No model loaded' : 'No partner pairs in model'}
		</div>
	{:else}
		<div class="row">
			<select
				value={selectedKey}
				onchange={(e) => handleSelect((e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">— pick a pair —</option>
				{#each eligibleSourced as s (keyForOption(s))}
					<option value={keyForOption(s)}>{labelForOption(s)}</option>
				{/each}
			</select>
			<button onclick={handleRandom} title="Random pair">🎲</button>
			{#if selectedKey}
				<button onclick={handleClear} title="Clear selection">×</button>
			{/if}
		</div>
		{#if isStale && livePair}
			<div class="banner">
				⚠ Model changed
				<button onclick={handleRefresh}>Refresh</button>
			</div>
		{:else if isStale && !livePair}
			<div class="banner">
				Pair no longer exists in model
				<button onclick={handleClear}>Clear</button>
			</div>
		{/if}
		<div class="caption">Showing one pair — rules apply to all</div>
	{/if}
</div>

<style>
	.chooser {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 8px;
		border: 1px dotted black;
	}
	.title {
		font-weight: bold;
		font-size: 0.85em;
	}
	.row {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.row select {
		flex: 1;
	}
	.empty {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.85em;
	}
	.caption {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.8em;
	}
	.banner {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 0.85em;
		color: #b00020;
	}
	.banner button {
		font-size: 0.85em;
	}
</style>
