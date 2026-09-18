<script lang="ts">
	import {
		patternConfigStore,
		pageLayoutInfoStore,
		showMeasureIndicators,
		superConfigStore
	} from '$lib/stores';
	import { model3dBoundsStore } from '$lib/stores/superGlobuleStores';
	import { PAGE_PRESETS } from '$lib/cut-pattern/page-layout/page-presets';
	import {
		derivePageDimensions,
		deriveDistance,
		inchToMm,
		mmToInch
	} from '$lib/cut-pattern/page-layout/units';
	import { measurements, removeMeasurement, clearMeasurements } from '$lib/stores/measurementStore';
	import { interactionMode, isMeasureInteractionMode } from '../../three-renderer/interaction-mode';
	import { get } from 'svelte/store';
	import { collatedTubesStore, splitBudgetStore } from '$lib/stores';
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import {
		applyAutoSplits,
		clearAllSplits,
		resolveSplitSubunitCount
	} from '$lib/cut-pattern/split-boundaries';
	import { proposeTubeSplits } from '$lib/cut-pattern/auto-split-bands';
	import { describeAutoSplitResult } from '$lib/cut-pattern/auto-split-note';
	import type { PatternLayoutMode, TubeSplits } from '$lib/types';

	// Shallow copy on purpose. Binding to `$patternConfigStore.…pageLayout.x` mutates
	// that object in place, so a `$derived` returning the object itself resolves to the
	// SAME reference and never propagates — every readout below (units, preset, page
	// preview, model size) would stay frozen at its mount-time value. Copying gives the
	// derived a fresh identity each run so those recompute. Reads only; writes go
	// straight to the store.
	let cfg = $derived({ ...$patternConfigStore.patternConfig.pageLayout });
	let unit = $derived(cfg.displayUnit);
	const toDisplay = (mm: number) => (unit === 'inch' ? mmToInch(mm) : mm);
	const fromDisplay = (v: number) => (unit === 'inch' ? inchToMm(v) : v);
	// `pageScale` is pattern-units per mm, so mm = patternUnits / pageScale.
	// The split budget is measured in pattern units; every readout in this panel
	// is in the display unit, so it is converted rather than shown raw.
	const toMm = (patternUnits: number) =>
		cfg.pageScale ? patternUnits / cfg.pageScale : patternUnits;

	const MODE_ORDER: PatternLayoutMode[] = ['linear', 'line-wrap', 'page'];
	const MODE_LABEL: Record<PatternLayoutMode, string> = {
		linear: 'Linear',
		'line-wrap': 'Line-wrap',
		page: 'Page'
	};
	let mode = $derived($patternConfigStore.patternViewConfig.patternLayoutMode ?? 'linear');
	const cycleMode = () => {
		const next = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
		$patternConfigStore.patternViewConfig.patternLayoutMode = next;
	};

	// Ensure a surfaceProjectionConfig exists so the divisions/fill-all controls
	// have something to bind to when the surfaceProjection source is selected.
	$effect(() => {
		const pc = $superConfigStore.projectionConfigs[0];
		if (pc && !pc.surfaceProjectionConfig) {
			pc.surfaceProjectionConfig = { divisions: 0 };
		}
	});

	let presetId = $derived.by(() => {
		const p = PAGE_PRESETS.find(
			(p) =>
				Math.abs(p.width - cfg.pageSize.width) < 0.5 &&
				Math.abs(p.height - cfg.pageSize.height) < 0.5
		);
		return p?.id ?? 'custom';
	});
	const applyPreset = (id: string) => {
		const p = PAGE_PRESETS.find((p) => p.id === id);
		if (p)
			$patternConfigStore.patternConfig.pageLayout.pageSize = { width: p.width, height: p.height };
	};

	let derived3d = $derived(
		$model3dBoundsStore ? derivePageDimensions($model3dBoundsStore, cfg.pageScale) : null
	);

	let isMeasuring = $derived(isMeasureInteractionMode($interactionMode));

	const startMeasuring = () => {
		interactionMode.set({ type: 'point-select-measure', data: { pick: 2, points: [] } });
	};
	const stopMeasuring = () => {
		interactionMode.set({ type: 'standard' });
	};

	// --- Splits ------------------------------------------------------------
	//
	// Split placing is a 2D-only interaction mode: `BandComponent` renders a click
	// target on every legal quad boundary while it is on. The mode lives in the
	// module-level `interactionMode` store, not in component state, because this
	// panel unmounts whenever the sidebar closes.
	let isPlacingSplits = $derived($interactionMode.type === 'quad-split-select');
	const startSplits = () => {
		interactionMode.set({ type: 'quad-split-select' });
	};
	const stopSplits = () => {
		interactionMode.set({ type: 'standard' });
	};

	let tubeSplits = $derived($patternConfigStore.patternConfig.splits?.tubeSplits ?? []);
	const countSplits = (list: TubeSplits[]) => list.reduce((n, t) => n + t.quads.length, 0);
	let splitCount = $derived(countSplits(tubeSplits));

	/**
	 * Published by `CutPatternRenderer`, which is the only place the EFFECTIVE
	 * bounds the layout measures are known. Never recomputed here: a second
	 * measurement could disagree with the layout about what overflows.
	 */
	let budget = $derived($splitBudgetStore);

	/**
	 * Why Auto-split cannot help, or undefined when it can. Splitting only ever
	 * shortens a piece, so a band that is too WIDE, or one that fits rotated, is
	 * not a case splits address (`split-budget.ts`).
	 */
	let autoSplitBlocked = $derived.by(() => {
		if (!budget.measured) return 'no bands measured';
		if (budget.lengthOverflow) return undefined;
		if (budget.widthBlocked) return 'too wide for the page — no split can help';
		return 'nothing overflows the page';
	});

	// Ephemeral feedback on the last click; it is meant to be lost on remount,
	// unlike the mode above, which must survive it.
	//
	// Two parts: a fixed message (nothing to propose, or cleared), and the result
	// of a run that DID place splits, which is re-phrased live against the budget
	// the renderer republishes after regenerating — the solver's sizing is a
	// heuristic and its set is tube-wide, so a run can add splits and still leave
	// a piece over the page. Between the click and that republish the budget is
	// the pre-split one, so the note reads pessimistically for a moment and then
	// corrects itself; pessimistic is the safe direction for a cut file.
	let autoSplitMessage = $state('');
	let autoSplitResult = $state<{ added: number; tubes: number } | null>(null);
	let autoSplitNote = $derived(
		autoSplitResult
			? describeAutoSplitResult({
					...autoSplitResult,
					stillOverflows: budget.measured && budget.lengthOverflow
				})
			: autoSplitMessage
	);

	const autoSplit = () => {
		const current = get(patternConfigStore);
		const proposals = proposeTubeSplits(get(collatedTubesStore), {
			// The renderer's budget is already `contentHeight` MINUS the per-piece
			// tag/label footprint — every new piece carries its own tag, so the raw
			// content box would over-promise (`auto-split.ts`, budget contract).
			pieceLengthBudget: budget.pieceLengthBudget,
			// The same resolution generation judges splits with, and the same one
			// the click targets use. If these diverged, auto-split would propose
			// positions generation then rejects.
			subunitCount: resolveSplitSubunitCount(current.patternTypeConfig)
		});
		if (proposals.length === 0) {
			autoSplitResult = null;
			autoSplitMessage = 'no legal split set makes these bands fit';
			return;
		}
		// UNION, never replace: nothing authorises discarding hand-placed splits,
		// and proposals derived from parent bands make repeat clicks idempotent.
		const next = applyAutoSplits(current, proposals);
		const added =
			countSplits(next.patternConfig.splits?.tubeSplits ?? []) -
			countSplits(current.patternConfig.splits?.tubeSplits ?? []);
		patternConfigStore.set(next);
		autoSplitMessage = '';
		autoSplitResult = { added, tubes: proposals.length };
	};

	const clearSplits = () => {
		patternConfigStore.set(clearAllSplits(get(patternConfigStore)));
		autoSplitResult = null;
		autoSplitMessage = '';
	};

	/**
	 * Splits generation dropped, from the same `rejectedSplits` the page toast
	 * reports. Deliberately quieter than that toast — a count and the addresses,
	 * no reasons — because a second full alarm in the panel is noise.
	 *
	 * Nothing here prunes: a dropped split stays saved and applies again when it
	 * becomes valid (spec amendment, "Dropped splits are reported, data is
	 * untouched").
	 */
	let droppedSplits = $derived($superGlobulePatternStore.rejectedSplits ?? []);
	let droppedSummary = $derived(
		droppedSplits
			.slice(0, 6)
			.map((r) => `t${r.tube} q${r.quad}`)
			.join(', ') + (droppedSplits.length > 6 ? ', …' : '')
	);

	/**
	 * Only completed pairs get a readout; an open point is still being placed.
	 * The open measurement (if any) is always last in `$measurements` (see
	 * measurementStore's invariant), so numbering the completed ones by their
	 * position among themselves — rather than by index into the raw list —
	 * keeps the visible labels contiguous (1, 2, 3, …) whether or not a point
	 * is currently pending, and renumbers cleanly after a removal instead of
	 * leaving gaps.
	 */
	let completedMeasurements = $derived(
		$measurements
			.filter((m) => m.b !== null)
			.map((m, index) => ({ ...m, b: m.b!, label: index + 1 }))
	);

	let preview = $derived.by(() => {
		const maxDim = Math.max(cfg.pageSize.width, cfg.pageSize.height) || 1;
		const k = 110 / maxDim;
		const w = cfg.pageSize.width * k;
		const h = cfg.pageSize.height * k;
		const m = cfg.margin * k;
		return { w, h, m, x: (120 - w) / 2, y: (120 - h) / 2 };
	});

	const fmt = (n: number) => n.toFixed(2);
</script>

<div class="page-editor">
	<button class="mode-cycle" onclick={cycleMode}>Layout: {MODE_LABEL[mode]}</button>

	<label>
		Band order
		<select bind:value={$patternConfigStore.patternViewConfig.bandSortMode}>
			<option value="tube-order">Tube order</option>
			<option value="end-connection-tube">End connection</option>
		</select>
	</label>

	<label>
		Geometry
		<select bind:value={$patternConfigStore.patternViewConfig.patternSource}>
			<option value="globule">Globule</option>
			<option value="projection">Projection</option>
			<option value="surfaceProjection">Surface</option>
			<option value="voronoi">Voronoi</option>
			<option value="voronoiSurface">Voronoi Surface</option>
		</select>
	</label>

	{#if $patternConfigStore.patternViewConfig.patternSource === 'surfaceProjection' && $superConfigStore.projectionConfigs[0]?.surfaceProjectionConfig}
		<label>
			divisions
			<input
				type="number"
				min="0"
				max="5"
				step="1"
				bind:value={$superConfigStore.projectionConfigs[0].surfaceProjectionConfig.divisions}
			/>
		</label>
		<label class="indicator-toggle">
			<input
				type="checkbox"
				checked={$superConfigStore.projectionConfigs[0].surfaceProjectionConfig.fillAll ?? false}
				onchange={(e) => {
					const checked = (e.currentTarget as HTMLInputElement).checked;
					$superConfigStore = {
						...$superConfigStore,
						projectionConfigs: $superConfigStore.projectionConfigs.map((pc, i) =>
							i === 0
								? {
										...pc,
										surfaceProjectionConfig: {
											...pc.surfaceProjectionConfig!,
											fillAll: checked
										}
									}
								: pc
						)
					};
				}}
			/>
			fill all
		</label>
	{:else if $patternConfigStore.patternViewConfig.patternSource === 'voronoiSurface' && $superConfigStore.voronoiConfig}
		<label class="indicator-toggle">
			<input
				type="checkbox"
				checked={$superConfigStore.voronoiConfig.fillAll ?? false}
				onchange={(e) => {
					const checked = (e.currentTarget as HTMLInputElement).checked;
					$superConfigStore = {
						...$superConfigStore,
						voronoiConfig: { ...$superConfigStore.voronoiConfig!, fillAll: checked }
					};
				}}
			/>
			fill all
		</label>
	{/if}

	<label>
		gap
		<input type="number" min="0" step="1" bind:value={$patternConfigStore.patternViewConfig.gap} />
	</label>

	{#if mode === 'line-wrap'}
		<label>
			wrap width
			<input
				type="number"
				min="50"
				max="5000"
				step="10"
				bind:value={$patternConfigStore.patternViewConfig.wrapWidth}
			/>
		</label>
	{/if}

	<label>
		keepConnected (px)
		<input
			type="number"
			min="0"
			step="1"
			bind:value={$patternConfigStore.patternConfig.pageLayout.keepConnected}
		/>
	</label>

	{#if mode === 'page'}
		<label>
			Algorithm
			<select bind:value={$patternConfigStore.patternConfig.pageLayout.algorithm}>
				<option value="flex-wrap">Flex-wrap</option>
				<option value="skyline">Skyline</option>
			</select>
		</label>

		{#if $patternConfigStore.patternConfig.pageLayout.algorithm === 'skyline'}
			<label>
				reorder window
				<input
					type="number"
					min="1"
					step="1"
					bind:value={$patternConfigStore.patternConfig.pageLayout.reorderWindow}
				/>
			</label>
			<label class="indicator-toggle">
				<input
					type="checkbox"
					bind:checked={$patternConfigStore.patternConfig.pageLayout.allowRotation}
				/>
				allow rotation
			</label>
		{/if}

		<label>
			Preset
			<select
				value={presetId}
				onchange={(e) => applyPreset((e.currentTarget as HTMLSelectElement).value)}
			>
				{#each PAGE_PRESETS as p (p.id)}
					<option value={p.id}>{p.label}</option>
				{/each}
				<option value="custom">Custom</option>
			</select>
		</label>

		<label>
			Units
			<select bind:value={$patternConfigStore.patternConfig.pageLayout.displayUnit}>
				<option value="inch">inch</option>
				<option value="mm">mm</option>
			</select>
		</label>

		<label>
			Width ({unit})
			<input
				type="number"
				step="0.1"
				value={fmt(toDisplay(cfg.pageSize.width))}
				onchange={(e) =>
					($patternConfigStore.patternConfig.pageLayout.pageSize.width = fromDisplay(
						Number((e.currentTarget as HTMLInputElement).value)
					))}
			/>
		</label>
		<label>
			Height ({unit})
			<input
				type="number"
				step="0.1"
				value={fmt(toDisplay(cfg.pageSize.height))}
				onchange={(e) =>
					($patternConfigStore.patternConfig.pageLayout.pageSize.height = fromDisplay(
						Number((e.currentTarget as HTMLInputElement).value)
					))}
			/>
		</label>

		<label>
			pageScale (units/mm)
			<input
				type="number"
				step="0.001"
				bind:value={$patternConfigStore.patternConfig.pageLayout.pageScale}
			/>
		</label>

		<label>
			Margin ({unit})
			<input
				type="number"
				step="0.1"
				value={fmt(toDisplay(cfg.margin))}
				onchange={(e) =>
					($patternConfigStore.patternConfig.pageLayout.margin = fromDisplay(
						Number((e.currentTarget as HTMLInputElement).value)
					))}
			/>
		</label>

		<svg class="preview" viewBox="0 0 120 120" width="120" height="120">
			<rect
				x={preview.x}
				y={preview.y}
				width={preview.w}
				height={preview.h}
				fill="#fff"
				stroke="#999"
			/>
			<rect
				x={preview.x + preview.m}
				y={preview.y + preview.m}
				width={preview.w - 2 * preview.m}
				height={preview.h - 2 * preview.m}
				fill="none"
				stroke="#ccc"
				stroke-dasharray="3 3"
			/>
		</svg>

		<div class="derived">
			<strong>Pages</strong>
			<div>
				{$pageLayoutInfoStore.pageCount}
				{$pageLayoutInfoStore.pageCount === 1 ? 'page' : 'pages'}
				{#if $pageLayoutInfoStore.overflow}<span class="warn">(overflow)</span>{/if}
			</div>
		</div>

		<div class="derived">
			<strong>Model size</strong>
			{#if derived3d}
				<div class="axis-x">X: {fmt(derived3d.mm.x)} mm / {fmt(derived3d.inch.x)} in</div>
				<div class="axis-y">Y: {fmt(derived3d.mm.y)} mm / {fmt(derived3d.inch.y)} in</div>
				<div class="axis-z">Z: {fmt(derived3d.mm.z)} mm / {fmt(derived3d.inch.z)} in</div>
			{:else}
				<div>—</div>
			{/if}

			{#each completedMeasurements as m (m.id)}
				{@const d = deriveDistance(m.a, m.b, cfg.pageScale)}
				<div class="measurement">
					<span>{m.label}: {fmt(d.mm)} mm / {fmt(d.inch)} in</span>
					<button
						class="clear-measurement"
						title="Remove this measurement"
						onclick={() => removeMeasurement(m.id)}>X</button
					>
				</div>
			{/each}

			<button class="measure-button" onclick={isMeasuring ? stopMeasuring : startMeasuring}>
				{isMeasuring ? 'Done measuring' : 'New measurement'}
			</button>
			{#if isMeasuring}
				<div class="measure-hint">Click two points on the model</div>
			{/if}
			{#if $measurements.length > 0}
				<button class="measure-button" onclick={clearMeasurements}>Clear measurements</button>
			{/if}

			<label class="indicator-toggle">
				<input type="checkbox" bind:checked={$showMeasureIndicators} />
				show measure points
			</label>
		</div>
	{/if}

	<!-- Splits. The ONE entry point for splitting: the Task 14 mode toggle is
	     folded in here rather than living beside a second control. Outside the
	     `page` branch on purpose — splits apply to the pattern in every layout
	     mode, and the page size they are sized against is configured either way. -->
	<div class="derived">
		<strong>Splits</strong>

		<button class="measure-button" onclick={isPlacingSplits ? stopSplits : startSplits}>
			{isPlacingSplits ? 'Done placing splits' : 'Place splits'}
		</button>
		{#if isPlacingSplits}
			<div class="measure-hint">Click a quad boundary in the pattern view</div>
		{/if}

		<button class="measure-button" onclick={autoSplit} disabled={!!autoSplitBlocked}>
			Auto-split
		</button>
		{#if autoSplitBlocked}
			<div class="measure-hint">Auto-split: {autoSplitBlocked}</div>
		{:else}
			<div class="measure-hint">
				Piece budget {fmt(toDisplay(toMm(budget.pieceLengthBudget)))}
				{unit}
				{#if budget.perPieceFootprint > 0}(less {fmt(toDisplay(toMm(budget.perPieceFootprint)))}
					{unit} label){/if}
			</div>
		{/if}
		{#if autoSplitNote}
			<div class="measure-hint">{autoSplitNote}</div>
		{/if}

		{#if splitCount > 0}
			<div>
				{splitCount} split{splitCount === 1 ? '' : 's'} in {tubeSplits.length} tube{tubeSplits.length ===
				1
					? ''
					: 's'}
			</div>
			{#each tubeSplits as t (t.tube)}
				<div class="measure-hint">t{t.tube}: {t.quads.join(', ')}</div>
			{/each}
			<button class="measure-button" onclick={clearSplits}>Clear splits</button>
		{:else}
			<div class="measure-hint">No splits</div>
		{/if}

		{#if droppedSplits.length > 0}
			<div class="warn">{droppedSplits.length} dropped: {droppedSummary}</div>
		{/if}
	</div>
</div>

<style>
	.page-editor {
		width: 220px;
		font-family: monospace;
		font-size: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.mode-cycle {
		padding: 2px 8px;
		font-family: monospace;
		font-size: 12px;
		cursor: pointer;
	}
	label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}
	input,
	select {
		width: 90px;
		font-family: monospace;
		font-size: 12px;
	}
	.preview {
		align-self: center;
		border: 1px solid #eee;
	}
	.derived {
		border-top: 1px solid #eee;
		padding-top: 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	/* Match the 3D measurement-indicator colours: x = red, y = green, z = blue. */
	.axis-x {
		color: red;
	}
	.axis-y {
		color: green;
	}
	.axis-z {
		color: blue;
	}
	.indicator-toggle {
		justify-content: flex-start;
		gap: 6px;
		margin-top: 4px;
	}
	.indicator-toggle input {
		width: auto;
	}
	.warn {
		color: #c00;
	}
	/* Arbitrary measurements are numbered and black, distinguishing them from
	   the axis-coloured X/Y/Z extents above. */
	.measurement {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
		color: black;
	}
	.clear-measurement {
		border: 0;
		background: transparent;
		cursor: pointer;
		font-family: monospace;
		font-size: 11px;
		padding: 0 4px;
		line-height: 1;
	}
	.clear-measurement:hover {
		color: #c00;
	}
	.measure-button {
		margin-top: 4px;
		padding: 2px 8px;
		font-family: monospace;
		font-size: 12px;
		cursor: pointer;
	}
	.measure-hint {
		color: #666;
		font-size: 11px;
	}
</style>
