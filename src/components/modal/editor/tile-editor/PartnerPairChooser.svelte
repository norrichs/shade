<script lang="ts">
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import { partnerHighlightStore } from '$lib/stores/partnerHighlightStore';
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

	const bands = $derived.by((): BandCutPattern[] => {
		const tubesOf = (source: any): { bands: BandCutPattern[] }[] | undefined =>
			source?.projectionCutPattern?.tubes ?? source?.tubes;
		const fromCut = (source: any): BandCutPattern[] =>
			tubesOf(source)?.flatMap((t) => t.bands) ?? [];
		const fromProjection = fromCut($superGlobulePatternStore?.projectionPattern);
		const fromSurface = fromCut($superGlobulePatternStore?.surfaceProjectionPattern);
		const fromGlobuleTube = fromCut($superGlobulePatternStore?.globuleTubePattern);
		const fromSuper =
			($superGlobulePatternStore?.superGlobulePattern as any)?.bandPatterns ?? [];
		return [...fromProjection, ...fromSurface, ...fromGlobuleTube, ...fromSuper];
	});
	const eligible = $derived(getEligibleBands(bands, mode));

	let selectedAddressJSON: string = $state('');

	let snapshot: ResolvedPair | null = $state(null);

	const livePair = $derived.by((): ResolvedPair | null => {
		if (!selectedAddressJSON) return null;
		const addr = JSON.parse(selectedAddressJSON) as GlobuleAddress_Band;
		return resolvePair(bands, addr, mode);
	});

	const isStale = $derived.by(() => {
		if (!snapshot) return false;
		if (!livePair) return true; // selected band disappeared
		return !pairsEqual(snapshot, livePair);
	});

	const addressForOption = (b: BandCutPattern): string => JSON.stringify(b.address);
	const labelForOption = (b: BandCutPattern): string =>
		`Tube ${b.address.tube} / Band ${b.address.band}`;

	const handleSelect = (addrJSON: string) => {
		selectedAddressJSON = addrJSON;
		if (!addrJSON) {
			snapshot = null;
			onChange(null);
			partnerHighlightStore.set({ start: null, end: null });
			return;
		}
		const addr = JSON.parse(addrJSON) as GlobuleAddress_Band;
		const fresh = resolvePair(bands, addr, mode);
		snapshot = fresh;
		onChange(fresh);
		if (fresh) {
			partnerHighlightStore.set({
				start: mode === 'partnerStart' ? fresh.mainAddress : fresh.ghostAddress,
				end: mode === 'partnerEnd' ? fresh.mainAddress : fresh.ghostAddress
			});
		} else {
			partnerHighlightStore.set({ start: null, end: null });
		}
	};

	const handleRandom = () => {
		if (eligible.length === 0) return;
		const random = eligible[Math.floor(Math.random() * eligible.length)];
		handleSelect(addressForOption(random));
	};

	const handleClear = () => {
		handleSelect('');
	};

	const handleRefresh = () => {
		if (!selectedAddressJSON) return;
		const addr = JSON.parse(selectedAddressJSON) as GlobuleAddress_Band;
		const fresh = resolvePair(bands, addr, mode);
		snapshot = fresh;
		onChange(fresh);
		if (!fresh) {
			// Selected band gone; clear
			selectedAddressJSON = '';
			partnerHighlightStore.set({ start: null, end: null });
		}
	};

	onDestroy(() => {
		partnerHighlightStore.set({ start: null, end: null });
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
				value={selectedAddressJSON}
				onchange={(e) => handleSelect((e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">— pick a pair —</option>
				{#each eligible as b (addressForOption(b))}
					<option value={addressForOption(b)}>{labelForOption(b)}</option>
				{/each}
			</select>
			<button onclick={handleRandom} title="Random pair">🎲</button>
			{#if selectedAddressJSON}
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
