<!-- src/components/modal/editor/tile-editor/BaseQuadSelector.svelte -->
<script lang="ts">
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import type { BandCutPattern } from '$lib/types';
	import type { PartnerHighlightSource } from '$lib/stores/partnerHighlightStore';

	export type BaseQuadAddress = {
		source: PartnerHighlightSource;
		globule: number;
		tube: number;
		band: number;
		facet: number;
	};

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
	let pendingBand: number | null = $state(null);
	let pendingFacet: number | null = $state(null);

	// Sync pending state from external value (e.g. parent reset). Guard against
	// no-op writes so we don't fire onChange in a loop.
	$effect(() => {
		const next = {
			source: value?.source ?? null,
			tube: value?.tube ?? null,
			band: value?.band ?? null,
			facet: value?.facet ?? null
		};
		if (
			next.source !== pendingSource ||
			next.tube !== pendingTube ||
			next.band !== pendingBand ||
			next.facet !== pendingFacet
		) {
			pendingSource = next.source;
			pendingTube = next.tube;
			pendingBand = next.band;
			pendingFacet = next.facet;
		}
	});

	const setSelections = (
		s: PartnerHighlightSource | null,
		t: number | null,
		b: number | null,
		f: number | null
	) => {
		pendingSource = s;
		pendingTube = t;
		pendingBand = b;
		pendingFacet = f;
		if (s !== null && t !== null && b !== null && f !== null) {
			onChange({ source: s, globule: 0, tube: t, band: b, facet: f });
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
		setSelections(pendingSource, pendingTube, v === '' ? null : Number(v), null);
	};
	const onFacetChange = (e: Event) => {
		const v = (e.currentTarget as HTMLSelectElement).value;
		setSelections(pendingSource, pendingTube, pendingBand, v === '' ? null : Number(v));
	};

	const tubesForCurrent = $derived(
		pendingSource ? (allSources.find((s) => s.source === pendingSource)?.tubes ?? []) : []
	);
	const bandsForCurrent = $derived(
		pendingTube !== null ? (tubesForCurrent[pendingTube]?.bands ?? []) : []
	);
	const facetsForCurrent = $derived(
		pendingBand !== null ? (bandsForCurrent[pendingBand]?.facets.length ?? 0) : 0
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
			{#each bandsForCurrent as _, i (i)}
				<option value={i}>Band {i}</option>
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
