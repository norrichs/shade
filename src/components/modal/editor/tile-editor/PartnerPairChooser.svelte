<script lang="ts">
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import { partnerHighlightStore } from '$lib/stores/partnerHighlightStore';
	import {
		getEligibleBands,
		resolvePair,
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

	// ProjectionCutPattern → tubes: TubeCutPattern[] → bands: BandCutPattern[]
	const bands = $derived<BandCutPattern[]>(
		($superGlobulePatternStore?.projectionPattern as any)?.tubes?.flatMap(
			(t: { bands: BandCutPattern[] }) => t.bands
		) ?? []
	);
	const eligible = $derived(getEligibleBands(bands, mode));

	let selectedAddressJSON: string = $state('');

	const addressForOption = (b: BandCutPattern): string => JSON.stringify(b.address);
	const labelForOption = (b: BandCutPattern): string =>
		`Tube ${b.address.tube} / Band ${b.address.band}`;

	const handleSelect = (addrJSON: string) => {
		selectedAddressJSON = addrJSON;
		if (!addrJSON) {
			onChange(null);
			partnerHighlightStore.set({ start: null, end: null });
			return;
		}
		const addr = JSON.parse(addrJSON) as GlobuleAddress_Band;
		const snapshot = resolvePair(bands, addr, mode);
		onChange(snapshot);
		if (snapshot) {
			partnerHighlightStore.set({
				start: mode === 'partnerStart' ? snapshot.mainAddress : snapshot.ghostAddress,
				end: mode === 'partnerEnd' ? snapshot.mainAddress : snapshot.ghostAddress
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

	onDestroy(() => {
		partnerHighlightStore.set({ start: null, end: null });
	});
</script>

<div class="chooser">
	<div class="title">Pair</div>
	{#if eligible.length === 0}
		<div class="empty">{bands.length === 0 ? 'No model loaded' : 'No partner pairs in model'}</div>
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
</style>
