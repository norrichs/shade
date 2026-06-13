<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import { pageEditorOpen } from '$lib/stores/pageEditorStore';
	import { model3dBoundsStore } from '$lib/stores/superGlobuleStores';
	import { PAGE_PRESETS } from '$lib/cut-pattern/page-layout/page-presets';
	import { derivePageDimensions, inchToMm, mmToInch } from '$lib/cut-pattern/page-layout/units';

	let cfg = $derived($patternConfigStore.patternConfig.pageLayout);
	let unit = $derived(cfg.displayUnit);
	const toDisplay = (mm: number) => (unit === 'inch' ? mmToInch(mm) : mm);
	const fromDisplay = (v: number) => (unit === 'inch' ? inchToMm(v) : v);

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

{#if $pageEditorOpen}
	<div class="page-editor">
		<header>
			<span>Page Layout</span>
			<button on:click={() => ($pageEditorOpen = false)} aria-label="Close">×</button>
		</header>

		<label>
			Preset
			<select
				value={presetId}
				on:change={(e) => applyPreset((e.currentTarget as HTMLSelectElement).value)}
			>
				{#each PAGE_PRESETS as p}
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
				on:change={(e) =>
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
				on:change={(e) =>
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
				on:change={(e) =>
					($patternConfigStore.patternConfig.pageLayout.margin = fromDisplay(
						Number((e.currentTarget as HTMLInputElement).value)
					))}
			/>
		</label>

		<label>
			Layout gap (units)
			<input type="number" step="1" bind:value={$patternConfigStore.patternConfig.pageLayout.gap} />
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
			<strong>Model size</strong>
			{#if derived3d}
				<div>X: {fmt(derived3d.mm.x)} mm / {fmt(derived3d.inch.x)} in</div>
				<div>Y: {fmt(derived3d.mm.y)} mm / {fmt(derived3d.inch.y)} in</div>
				<div>Z: {fmt(derived3d.mm.z)} mm / {fmt(derived3d.inch.z)} in</div>
			{:else}
				<div>—</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.page-editor {
		position: fixed;
		top: 80px;
		right: 24px;
		z-index: 9000;
		width: 220px;
		padding: 10px 12px;
		background: white;
		border: 1px solid #ccc;
		border-radius: 6px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
		font-family: monospace;
		font-size: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: bold;
	}
	header button {
		border: none;
		background: none;
		font-size: 18px;
		cursor: pointer;
		line-height: 1;
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
</style>
