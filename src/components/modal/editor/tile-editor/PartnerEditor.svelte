<!-- src/components/modal/editor/tile-editor/PartnerEditor.svelte -->
<script lang="ts">
	import type { TiledPatternSpec, IndexPair } from '$lib/patterns/spec-types';
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import { partnerHighlightStore } from '$lib/stores/partnerHighlightStore';
	import type { BandCutPattern } from '$lib/types';
	import BaseQuadSelector, { type BaseQuadAddress } from './BaseQuadSelector.svelte';
	import PartnersViewport from './PartnersViewport.svelte';
	import PartnerRulesPanel from './PartnerRulesPanel.svelte';
	import {
		resolveBaseAndPartners,
		type PartnerBundle,
		type ResolvedPartner,
		type RuleSetKey
	} from './partner-neighbors';
	import { onDestroy } from 'svelte';
	import type { Vertex } from '../segment-vertices';
	import { addRuleForPairing, removeRulesForPairing } from '../vertex-addressing';

	let {
		spec,
		onChange
	}: {
		spec: TiledPatternSpec;
		onChange: (next: TiledPatternSpec) => void;
	} = $props();

	let address: BaseQuadAddress | null = $state(null);
	let snapshot: PartnerBundle | null = $state(null);

	const tubesForSource = (source: string): { bands: BandCutPattern[] }[] | undefined => {
		const tubesOf = (raw: any): { bands: BandCutPattern[] }[] | undefined =>
			raw?.projectionCutPattern?.tubes ?? raw?.tubes;
		if (source === 'projection') return tubesOf($superGlobulePatternStore?.projectionPattern);
		if (source === 'surface') return tubesOf($superGlobulePatternStore?.surfaceProjectionPattern);
		if (source === 'globuleTube') return tubesOf($superGlobulePatternStore?.globuleTubePattern);
		return undefined;
	};

	const flattenBands = (source: string): BandCutPattern[] => {
		const tubes = tubesForSource(source);
		return tubes?.flatMap((t) => t.bands) ?? [];
	};

	const writeHighlight = (source: any, b: PartnerBundle | null) => {
		partnerHighlightStore.set({
			source,
			base: b?.base.address ?? null,
			top: b?.top?.address ?? null,
			bottom: b?.bottom?.address ?? null,
			left: b?.left?.address ?? null,
			right: b?.right?.address ?? null
		});
	};

	const handleAddressChange = (next: BaseQuadAddress | null) => {
		address = next;
		if (!next) {
			snapshot = null;
			partnerHighlightStore.set({ source: 'projection', base: null, top: null, bottom: null, left: null, right: null });
			return;
		}
		const bands = flattenBands(next.source);
		const fresh = resolveBaseAndPartners(bands, {
			globule: next.globule,
			tube: next.tube,
			band: next.band,
			facet: next.facet
		});
		snapshot = fresh;
		writeHighlight(next.source as any, fresh);
	};

	const ruleArray = (key: RuleSetKey): IndexPair[] => {
		if (key === 'withinBand') return spec.adjustments.withinBand;
		if (key === 'acrossBands') return spec.adjustments.acrossBands;
		if (key === 'partner.startEnd') return spec.adjustments.partner.startEnd;
		return spec.adjustments.partner.endEnd;
	};

	const setRuleArray = (key: RuleSetKey, next: IndexPair[]) => {
		const updated: TiledPatternSpec = $state.snapshot(spec) as TiledPatternSpec;
		const clean: IndexPair[] = next.map((r) => ({ source: r.source, target: r.target }));
		if (key === 'withinBand') updated.adjustments.withinBand = clean;
		else if (key === 'acrossBands') updated.adjustments.acrossBands = clean;
		else if (key === 'partner.startEnd') updated.adjustments.partner.startEnd = clean;
		else updated.adjustments.partner.endEnd = clean;
		onChange(updated);
	};

	const handleAddRule = (partner: ResolvedPartner, baseVertex: Vertex, partnerVertex: Vertex) => {
		const next = addRuleForPairing(ruleArray(partner.ruleSet), spec.unit, baseVertex, partnerVertex);
		setRuleArray(partner.ruleSet, next);
	};

	const handleDeleteConnection = (
		partner: ResolvedPartner,
		baseVertex: Vertex,
		partnerVertex: Vertex
	) => {
		const next = removeRulesForPairing(ruleArray(partner.ruleSet), spec.unit, baseVertex, partnerVertex);
		setRuleArray(partner.ruleSet, next);
	};

	const handleDeleteIndex = (key: RuleSetKey, index: number) => {
		const arr = ruleArray(key);
		setRuleArray(key, arr.filter((_, i) => i !== index));
	};

	onDestroy(() => {
		partnerHighlightStore.set({ source: 'projection', base: null, top: null, bottom: null, left: null, right: null });
	});
</script>

<div class="partner-editor">
	<BaseQuadSelector value={address} onChange={handleAddressChange} />
	<div class="row">
		<div class="viewport-wrap">
			{#if snapshot}
				<PartnersViewport
					bundle={snapshot}
					withinBand={spec.adjustments.withinBand}
					acrossBands={spec.adjustments.acrossBands}
					partnerStartEnd={spec.adjustments.partner.startEnd}
					partnerEndEnd={spec.adjustments.partner.endEnd}
					onAddRule={handleAddRule}
					onDeleteConnection={handleDeleteConnection}
				/>
			{:else}
				<div class="empty">Select a base quad to begin.</div>
			{/if}
		</div>
		<PartnerRulesPanel
			withinBand={spec.adjustments.withinBand}
			acrossBands={spec.adjustments.acrossBands}
			partnerStartEnd={spec.adjustments.partner.startEnd}
			partnerEndEnd={spec.adjustments.partner.endEnd}
			onDelete={handleDeleteIndex}
		/>
	</div>
</div>

<style>
	.partner-editor {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row {
		display: flex;
		flex-direction: row;
	}
	.viewport-wrap {
		padding: 8px;
		flex: 1;
	}
	.empty {
		padding: 32px;
		color: rgba(0, 0, 0, 0.5);
		text-align: center;
	}
</style>
