<script lang="ts">
	import {
		bandViewerSelection,
		bandViewerMaxFacets,
		bandViewerRangeSource
	} from '#lib/stores/bandViewerStore.js';
	import type { BandViewerMode, BandViewerSelection } from '#lib/band-viewer/viewer-selection.js';

	/**
	 * Floating editor for the band viewer: which bands to unfold (Selected /
	 * Clicked / Range) and which facet anchors them. Everything lives in
	 * `bandViewerSelection`, since this content unmounts when the Floater closes.
	 */
	const MODES: { value: BandViewerMode; label: string; hint: string }[] = [
		{ value: 'selected', label: 'Selected', hint: 'the highlighted band' },
		{ value: 'clicked', label: 'Clicked', hint: 'click bands in any pane to add or remove them' },
		{ value: 'range', label: 'Range', hint: 'tube and band ranges, like the pattern view' }
	];

	type RangeKey = keyof BandViewerSelection['range'];

	const patch = (p: Partial<BandViewerSelection>) =>
		bandViewerSelection.update((sel) => ({ ...sel, ...p }));

	const pairOf = (key: RangeKey): [number, number] | undefined => {
		const r = $bandViewerSelection.range[key];
		return Array.isArray(r) && r.length === 2 ? [r[0], r[1]] : undefined;
	};

	const setRange = (key: RangeKey, value: [number, number] | undefined) =>
		patch({ range: { ...$bandViewerSelection.range, [key]: value } });

	const setEnd = (key: RangeKey, end: 0 | 1, raw: string) => {
		const pair = pairOf(key);
		const n = Math.trunc(Number(raw));
		if (!pair || !Number.isFinite(n)) return;
		pair[end] = n;
		setRange(key, pair);
	};

	const anchorOptions = $derived(Array.from({ length: $bandViewerMaxFacets }, (_, i) => i));
	const onAnchor = (e: Event & { currentTarget: HTMLSelectElement }) => {
		const v = e.currentTarget.value;
		patch({ anchor: v === 'auto' ? 'auto' : Number(v) });
	};
</script>

<div class="band-viewer-editor" data-testid="band-viewer-editor">
	<fieldset>
		<legend>Bands</legend>
		{#each MODES as m (m.value)}
			<label class="mode" title={m.hint}>
				<input
					type="radio"
					name="band-viewer-mode"
					value={m.value}
					checked={$bandViewerSelection.mode === m.value}
					onchange={() => patch({ mode: m.value })}
				/>
				{m.label}
			</label>
		{/each}
	</fieldset>

	{#if $bandViewerSelection.mode === 'clicked'}
		<div class="row">
			<span>
				{$bandViewerSelection.clicked?.keys.length ?? 0} band{($bandViewerSelection.clicked?.keys
					.length ?? 0) === 1
					? ''
					: 's'} — click bands to add or remove
			</span>
			<button onclick={() => patch({ clicked: null })} disabled={!$bandViewerSelection.clicked}>
				clear
			</button>
		</div>
	{:else if $bandViewerSelection.mode === 'range'}
		<div class="range">
			<div class="row">
				<button onclick={() => patch({ range: {} })}>all</button>
				{#if $bandViewerRangeSource}<span class="all">source: {$bandViewerRangeSource}</span>{/if}
			</div>
			{#each ['tubes', 'bands'] as const as key (key)}
				{@const pair = pairOf(key)}
				<div class="row">
					<span class="range-label">{key}</span>
					{#if pair}
						<input
							type="number"
							step="1"
							value={pair[0]}
							aria-label="{key} from"
							onchange={(e) => setEnd(key, 0, e.currentTarget.value)}
						/>
						<input
							type="number"
							step="1"
							value={pair[1]}
							aria-label="{key} to"
							onchange={(e) => setEnd(key, 1, e.currentTarget.value)}
						/>
						<button title="all {key}" onclick={() => setRange(key, undefined)}>×</button>
					{:else}
						<span class="all">all</span>
						<button onclick={() => setRange(key, [0, 0])}>Set {key}</button>
					{/if}
				</div>
			{/each}
			<p class="note">Inclusive; negative counts from the end; start after end wraps.</p>
		</div>
	{/if}

	<label class="row">
		<span>Anchor facet</span>
		<select
			value={$bandViewerSelection.anchor === 'auto' ? 'auto' : String($bandViewerSelection.anchor)}
			onchange={onAnchor}
			aria-label="Anchor facet"
		>
			<option value="auto">auto (most plane-parallel)</option>
			{#if $bandViewerSelection.anchor !== 'auto' && $bandViewerSelection.anchor >= $bandViewerMaxFacets}
				<option value={String($bandViewerSelection.anchor)}>{$bandViewerSelection.anchor}</option>
			{/if}
			{#each anchorOptions as i (i)}
				<option value={String(i)}>{i}</option>
			{/each}
		</select>
	</label>
</div>

<style>
	.band-viewer-editor {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 260px;
		font-size: 0.85rem;
	}
	fieldset {
		display: flex;
		gap: 12px;
		border: 1px solid #bbb;
		padding: 4px 8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.range {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
	}
	.range-label {
		width: 3.5em;
	}
	.range input {
		width: 4.5em;
	}
	.all {
		opacity: 0.6;
	}
	.note {
		margin: 0;
		opacity: 0.6;
		font-size: 0.75rem;
	}
</style>
