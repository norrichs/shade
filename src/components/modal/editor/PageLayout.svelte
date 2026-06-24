<script lang="ts">
	import {
		patternConfigStore,
		pageLayoutInfoStore,
		showMeasureIndicators,
		superConfigStore
	} from '$lib/stores';
	import { model3dBoundsStore } from '$lib/stores/superGlobuleStores';
	import { PAGE_PRESETS } from '$lib/cut-pattern/page-layout/page-presets';
	import { derivePageDimensions, inchToMm, mmToInch } from '$lib/cut-pattern/page-layout/units';
	import type { PatternLayoutMode } from '$lib/types';

	let cfg = $derived($patternConfigStore.patternConfig.pageLayout);
	let unit = $derived(cfg.displayUnit);
	const toDisplay = (mm: number) => (unit === 'inch' ? mmToInch(mm) : mm);
	const fromDisplay = (v: number) => (unit === 'inch' ? inchToMm(v) : v);

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
		<input
			type="number"
			min="0"
			step="1"
			bind:value={$patternConfigStore.patternViewConfig.gap}
		/>
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
			<label class="indicator-toggle">
				<input type="checkbox" bind:checked={$showMeasureIndicators} />
				show measure points
			</label>
		</div>
	{/if}
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
</style>
