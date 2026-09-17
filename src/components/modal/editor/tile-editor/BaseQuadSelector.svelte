<!-- src/components/modal/editor/tile-editor/BaseQuadSelector.svelte -->
<script lang="ts">
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import type { BandCutPattern } from '$lib/types';
	import type { PartnerHighlightSource } from '$lib/stores/partnerHighlightStore';
	import {
		bandKeyOf,
		bandOptionsForTube,
		baseQuadAddressOf,
		type BaseQuadAddress
	} from './base-quad-selection';

	let {
		value,
		onChange
	}: {
		value: BaseQuadAddress | null;
		onChange: (next: BaseQuadAddress | null) => void;
	} = $props();

	type SourcedTubes = { source: PartnerHighlightSource; tubes: { bands: BandCutPattern[] }[] };

	const allSources = $derived.by((): SourcedTubes[] => {
		const tubesOf = (raw: any): { bands: BandCutPattern[] }[] | undefined =>
			raw?.projectionCutPattern?.tubes ?? raw?.tubes;
		const out: SourcedTubes[] = [];
		const proj = tubesOf($superGlobulePatternStore?.projectionPattern);
		if (proj && proj.length) out.push({ source: 'projection', tubes: proj });
		const surf = tubesOf($superGlobulePatternStore?.surfaceProjectionPattern);
		if (surf && surf.length) out.push({ source: 'surface', tubes: surf });
		const gt = tubesOf($superGlobulePatternStore?.globuleTubePattern);
		if (gt && gt.length) out.push({ source: 'globuleTube', tubes: gt });
		return out;
	});

	const sourceLabel = (s: PartnerHighlightSource): string =>
		s === 'globuleTube' ? 'globule tube' : s;

	let pendingSource: PartnerHighlightSource | null = $state(null);
	let pendingTube: number | null = $state(null);
	// The selected band row's key (`b3` or `b3p1`), never an array position: a
	// split tube's band array interleaves pieces.
	let pendingBand: string | null = $state(null);
	let pendingFacet: number | null = $state(null);

	// Sync pending state from external value only when value transitions externally
	// (e.g. parent reset via the Clear button, or an external set). Don't fight our
	// own partial-selection state — `setSelections` calls `onChange(null)` during
	// partial selection, and we must not echo that back into pending.
	let lastValue: BaseQuadAddress | null = null;
	$effect(() => {
		if (value === lastValue) return;
		if (value === null) {
			pendingSource = null;
			pendingTube = null;
			pendingBand = null;
			pendingFacet = null;
		} else {
			pendingSource = value.source;
			pendingTube = value.tube;
			pendingBand = bandKeyOf(value);
			pendingFacet = value.facet;
		}
		lastValue = value;
	});

	const setSelections = (
		s: PartnerHighlightSource | null,
		t: number | null,
		b: string | null,
		f: number | null
	) => {
		pendingSource = s;
		pendingTube = t;
		pendingBand = b;
		pendingFacet = f;
		const option = b === null ? undefined : optionsOf(s, t).find((o) => o.key === b);
		if (s !== null && t !== null && option && f !== null) {
			onChange(baseQuadAddressOf(s, option.address, f));
		} else {
			onChange(null);
		}
	};

	const onSourceChange = (e: Event) => {
		const v = (e.currentTarget as HTMLSelectElement).value as PartnerHighlightSource | '';
		setSelections(v || null, null, null, null);
	};
	const onTubeChange = (e: Event) => {
		const v = (e.currentTarget as HTMLSelectElement).value;
		setSelections(pendingSource, v === '' ? null : Number(v), null, null);
	};
	const onBandChange = (e: Event) => {
		const v = (e.currentTarget as HTMLSelectElement).value;
		setSelections(pendingSource, pendingTube, v === '' ? null : v, null);
	};
	const onFacetChange = (e: Event) => {
		const v = (e.currentTarget as HTMLSelectElement).value;
		setSelections(pendingSource, pendingTube, pendingBand, v === '' ? null : Number(v));
	};

	const tubesOfSource = (s: PartnerHighlightSource | null) =>
		s ? (allSources.find((x) => x.source === s)?.tubes ?? []) : [];
	const optionsOf = (s: PartnerHighlightSource | null, t: number | null) =>
		t !== null ? bandOptionsForTube(tubesOfSource(s)[t]?.bands ?? []) : [];

	const tubesForCurrent = $derived(tubesOfSource(pendingSource));
	const bandOptions = $derived(optionsOf(pendingSource, pendingTube));
	const facetsForCurrent = $derived(
		pendingBand !== null ? (bandOptions.find((o) => o.key === pendingBand)?.facetCount ?? 0) : 0
	);
</script>

<div class="base-quad-selector">
	<div class="title">Base quad</div>
	<div class="row">
		<select value={pendingSource ?? ''} onchange={onSourceChange}>
			<option value="">— source —</option>
			{#each allSources as s (s.source)}
				<option value={s.source}>{sourceLabel(s.source)}</option>
			{/each}
		</select>

		<select value={pendingTube ?? ''} onchange={onTubeChange} disabled={pendingSource === null}>
			<option value="">— tube —</option>
			{#each tubesForCurrent as _, i (i)}
				<option value={i}>Tube {i}</option>
			{/each}
		</select>

		<select value={pendingBand ?? ''} onchange={onBandChange} disabled={pendingTube === null}>
			<option value="">— band —</option>
			{#each bandOptions as o (o.key)}
				<option value={o.key}>{o.label}</option>
			{/each}
		</select>

		<select value={pendingFacet ?? ''} onchange={onFacetChange} disabled={pendingBand === null}>
			<option value="">— quad —</option>
			{#each Array(facetsForCurrent) as _, i (i)}
				<option value={i}>Quad {i}</option>
			{/each}
		</select>
	</div>
</div>

<style>
	.base-quad-selector {
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
	select {
		flex: 1;
	}
	select:disabled {
		opacity: 0.4;
	}
</style>
