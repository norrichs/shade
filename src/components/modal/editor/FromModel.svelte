<script lang="ts">
	import { get } from 'svelte/store';
	import { superConfigStore } from '#lib/stores/index.js';
	import { toastStore } from '#lib/stores/toastStore.js';
	import { assetStatus, resolveAsset } from '#lib/mesh-import/asset-store.js';
	import { importModelFile } from '#lib/mesh-import/import-model.js';
	import { generateLevelPrototype } from '#lib/generate-shape.js';
	import { snapshotGcsFromModel } from '#lib/gcs/snapshot-gcs.js';
	import type { GlobuleConfig, SuperGlobuleConfig } from '#lib/types.js';
	import type { ImportedSurfaceConfig } from '#lib/projection-geometry/types.js';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Container from './Container.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import ImportedMeshControls from './ImportedMeshControls.svelte';
	import { importedMeshBusy } from './imported-mesh-busy';
	import { selectedGcsIndex } from './gcs-editor-store';
	import {
		defaultModelSource,
		fromModelBandCount,
		fromModelMessages,
		fromModelOpen
	} from './from-model-store';

	// Same sub-globule as the GCS editor around it.
	const sgIndex = 0;

	let globuleConfig = $derived($superConfigStore.subGlobuleConfigs[sgIndex]?.globuleConfig);
	let model = $derived(defaultModelSource($superConfigStore));
	let busy = $derived($importedMeshBusy);
	let missing = $derived(model ? $assetStatus[model.assetId] === 'missing' : false);

	let primaryVertexCount = $derived.by(() => {
		const shapes = globuleConfig?.shapeConfigs ?? [];
		const primary = shapes.find((shape) => shape.isPrimary) ?? shapes[0];
		return primary ? generateLevelPrototype(primary).vertices.length : 0;
	});
	let bandCount = $derived($fromModelBandCount ?? primaryVertexCount);

	let disabledReason = $derived(
		!model
			? 'Import a model first.'
			: missing
				? `${model.fileName} isn't on this device.`
				: !Number.isInteger(bandCount) || bandCount < 3
					? 'Bands must be at least 3.'
					: undefined
	);

	let fileInput: HTMLInputElement | undefined = $state();

	const updateGlobule = (transform: (globule: GlobuleConfig) => GlobuleConfig) => {
		const config: SuperGlobuleConfig = get(superConfigStore);
		if (!config.subGlobuleConfigs[sgIndex]) return;
		config.subGlobuleConfigs = config.subGlobuleConfigs.map((sub, index) =>
			index === sgIndex ? { ...sub, globuleConfig: transform(sub.globuleConfig) } : sub
		);
		superConfigStore.set(config);
	};

	const readModelSource = (): ImportedSurfaceConfig | undefined =>
		get(superConfigStore).subGlobuleConfigs[sgIndex]?.globuleConfig.modelSource;

	const writeModelSource = (next: ImportedSurfaceConfig) =>
		updateGlobule((globule) => ({ ...globule, modelSource: next }));

	const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

	const handleImport = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		importedMeshBusy.set(true);
		try {
			writeModelSource(await importModelFile(file));
		} catch (error) {
			toastStore.add({
				type: 'error',
				message: `Import failed: ${errorMessage(error)}`,
				dismissible: true
			});
		} finally {
			importedMeshBusy.set(false);
		}
	};

	const handleSnapshot = async () => {
		const source = model;
		const globule = globuleConfig;
		if (!source || !globule || disabledReason) return;
		const count = globule.shapeConfigs.length;
		if (
			count > 0 &&
			!confirm(`Replace all ${count} cross sections with slices of ${source.fileName}?`)
		) {
			return;
		}
		importedMeshBusy.set(true);
		try {
			const asset = await resolveAsset(source.assetId);
			if (!asset) {
				fromModelMessages.set({
					errors: [`${source.fileName} isn't on this device.`],
					warnings: []
				});
				return;
			}
			const result = snapshotGcsFromModel({
				globule,
				mesh: asset,
				normalize: source.normalize,
				bandCount
			});
			if (!result.ok) {
				fromModelMessages.set({ errors: result.errors, warnings: [] });
				return;
			}
			updateGlobule((current) => ({
				...current,
				shapeConfigs: result.shapeConfigs,
				modelSource: source
			}));
			selectedGcsIndex.set(0);
			fromModelMessages.set({ errors: [], warnings: result.warnings });
		} catch (error) {
			fromModelMessages.set({ errors: [`Snapshot failed: ${errorMessage(error)}`], warnings: [] });
		} finally {
			importedMeshBusy.set(false);
		}
	};
</script>

<details class="from-model" bind:open={$fromModelOpen}>
	<summary>From model</summary>
	<Container direction="column">
		<LabeledControl label="Model">
			<span>{model?.fileName ?? 'None'}</span>
			<button disabled={busy} onclick={() => fileInput?.click()}>Import file…</button>
			<input
				bind:this={fileInput}
				data-testid="from-model-file-input"
				type="file"
				accept=".glb,.gltf,.stl,.obj"
				hidden
				onchange={handleImport}
			/>
		</LabeledControl>

		<LabeledControl label="Bands">
			<NumberInput
				value={bandCount}
				onChange={(v) => fromModelBandCount.set(v)}
				step={1}
				min={3}
				max={1000}
			/>
		</LabeledControl>

		<button
			data-testid="from-model-snapshot"
			disabled={busy || !!disabledReason}
			title={disabledReason}
			onclick={handleSnapshot}
		>
			{busy ? 'Working…' : 'Snapshot'}
		</button>
		{#if disabledReason}
			<p class="hint">{disabledReason}</p>
		{/if}

		{#each $fromModelMessages.errors as message (message)}
			<p class="error" role="alert">{message}</p>
		{/each}
		{#each $fromModelMessages.warnings as message (message)}
			<p class="warning">{message}</p>
		{/each}

		<!-- Below the Snapshot button so the panel's essentials stay on screen. -->
		{#if globuleConfig?.modelSource}
			<details>
				<summary>Fit &amp; simplify</summary>
				<ImportedMeshControls
					surface={globuleConfig.modelSource}
					read={readModelSource}
					write={writeModelSource}
					showRayCenter={false}
				/>
			</details>
		{/if}
	</Container>
</details>

<style>
	.from-model {
		margin-top: 0.5rem;
	}
	.hint,
	.error,
	.warning {
		font-size: 0.85em;
		margin: 0;
	}
	.error {
		color: var(--color-error, #c33);
	}
	.warning {
		color: var(--color-warning, #c80);
	}
</style>
