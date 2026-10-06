<script lang="ts">
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { superConfigStore } from '$lib/stores';
	import { importedMeshBusy } from './imported-mesh-busy';
	import { toastStore } from '$lib/stores/toastStore';
	import { assetStatus, resolveAsset } from '$lib/mesh-import/asset-store';
	import {
		applySimplify,
		refit,
		replaceImportedModel,
		revertSimplify
	} from '$lib/mesh-import/import-model';
	import type { Point3 } from '$lib/types';
	import type { MeshAsset } from '$lib/mesh-import/types';
	import type { ImportedSurfaceConfig, UpAxis } from '$lib/projection-geometry/types';
	import LabeledControl from './LabeledControl.svelte';
	import Container from './Container.svelte';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import PointInput from '../../controls/super-control/PointInput.svelte';

	let { surface }: { surface: ImportedSurfaceConfig } = $props();

	const UP_AXES: UpAxis[] = ['+y', '+z', '-y', '-z', '+x', '-x'];

	let asset: MeshAsset | undefined = $state();
	let busy = $derived($importedMeshBusy);
	let replaceInput: HTMLInputElement | undefined = $state();
	// Writable deriveds: pending edits are kept until the fitted value itself changes
	// (not merely when a new surface object arrives).
	let upAxis: UpAxis = $derived(surface.normalize.upAxis);
	let targetSize = $derived(surface.normalize.targetSize);
	let targetTriangles = $state(0);

	let missing = $derived($assetStatus[surface.assetId] === 'missing');

	// Primitive, so the effect below fires on an asset change, not on every new surface object.
	let assetId = $derived(surface.assetId);

	// Load diagnostics whenever the asset changes (import, simplify, revert, re-pick).
	$effect(() => {
		const id = assetId;
		void resolveAsset(id).then((loaded) => {
			if (untrack(() => assetId) !== id) return;
			asset = loaded;
			if (loaded) targetTriangles = loaded.diagnostics.triangles;
		});
	});

	/** The store's surface, if it is (still) an imported model. */
	const currentImported = (): ImportedSurfaceConfig | undefined => {
		const current = get(superConfigStore).projectionConfigs[0].surfaceConfig;
		return current.type === 'ImportedMeshConfig' ? (current as ImportedSurfaceConfig) : undefined;
	};

	const setCurrent = (next: ImportedSurfaceConfig) => {
		const config = get(superConfigStore);
		config.projectionConfigs[0].surfaceConfig = next;
		superConfigStore.set(config);
	};

	/**
	 * Merge only the fields an operation owns (asset, fileName, fit, simplify) onto the
	 * store's current surface, so edits made meanwhile (transform, ray center) survive.
	 * Aborts if the surface is no longer the imported model the operation started from.
	 */
	const commitOwned = (startAssetId: string, next: ImportedSurfaceConfig): boolean => {
		const current = currentImported();
		if (!current || current.assetId !== startAssetId) return false;
		const merged: ImportedSurfaceConfig = {
			...current,
			assetId: next.assetId,
			fileName: next.fileName,
			normalize: next.normalize
		};
		if (next.simplify) merged.simplify = next.simplify;
		else delete merged.simplify;
		setCurrent(merged);
		return true;
	};

	const run = async (label: string, op: () => Promise<void>) => {
		importedMeshBusy.set(true);
		try {
			await op();
		} catch (error) {
			toastStore.add({
				type: 'error',
				message: `${label}: ${error instanceof Error ? error.message : String(error)}`,
				dismissible: true
			});
		} finally {
			importedMeshBusy.set(false);
		}
	};

	const handleReplace = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const startId = surface.assetId;
		const wasMissing = missing;
		await run('Replace model', async () => {
			const { config, sameFile } = await replaceImportedModel(surface, file);
			if (!commitOwned(startId, config)) return;
			if (!sameFile && wasMissing) {
				toastStore.add({
					type: 'warning',
					message: `${file.name} is a different file than originally used — refit applied`,
					duration: 5000
				});
			}
		});
	};

	const handleRefit = () => {
		const startId = surface.assetId;
		return run('Re-fit', async () => {
			commitOwned(startId, await refit(surface, upAxis, targetSize));
		});
	};

	const handleSimplify = () => {
		const startId = surface.assetId;
		return run('Simplify', async () => {
			commitOwned(startId, await applySimplify(surface, targetTriangles));
		});
	};

	const handleRevert = () => {
		const current = currentImported();
		if (current) commitOwned(current.assetId, revertSimplify(current));
	};

	const handleResetCenter = () => {
		const current = currentImported();
		if (current) setCurrent({ ...current, center: { x: 0, y: 0, z: 0 } });
	};

	const handleCenterChange = (center: Point3) => {
		const current = currentImported();
		if (current) setCurrent({ ...current, center });
	};
</script>

<section class="imported-mesh">
	{#if missing}
		<div class="missing" role="alert">
			Model <strong>{surface.fileName}</strong> isn't on this device.
			<button disabled={busy} onclick={() => replaceInput?.click()}>Re-pick file</button>
		</div>
	{/if}

	<Container direction="column">
		<LabeledControl label="Model">
			<span>{surface.fileName}</span>
			<button disabled={busy} onclick={() => replaceInput?.click()}>Replace…</button>
			<input
				bind:this={replaceInput}
				data-testid="model-replace-input"
				type="file"
				accept=".glb,.gltf,.stl,.obj"
				hidden
				onchange={handleReplace}
			/>
		</LabeledControl>

		{#if asset}
			<LabeledControl label="Mesh">
				<span>
					{asset.diagnostics.triangles} tris · {asset.diagnostics.vertices} verts
					{#if asset.diagnostics.droppedPrimitives > 0}
						· {asset.diagnostics.droppedPrimitives} non-mesh parts skipped
					{/if}
				</span>
			</LabeledControl>
			{#if asset.diagnostics.openEdges > 0}
				<p class="warning">
					{asset.diagnostics.openEdges} open edges — Projection needs a closed mesh visible from the center
				</p>
			{/if}
		{/if}

		<LabeledControl label="Up axis">
			<select bind:value={upAxis} disabled={busy}>
				{#each UP_AXES as axis (axis)}
					<option value={axis}>{axis}</option>
				{/each}
			</select>
		</LabeledControl>
		<LabeledControl label="Target size">
			<NumberInput
				value={targetSize}
				onChange={(v) => (targetSize = v)}
				step={10}
				min={1}
				max={100000}
			/>
		</LabeledControl>
		<button disabled={busy || missing} onclick={handleRefit}> Re-fit </button>

		<LabeledControl label="Ray center">
			<PointInput bind:value={() => surface.center, handleCenterChange} />
		</LabeledControl>
		<button disabled={busy} onclick={handleResetCenter}> Reset to model center </button>

		<LabeledControl label="Simplify to">
			<NumberInput
				value={targetTriangles}
				onChange={(v) => (targetTriangles = v)}
				step={100}
				min={1}
				max={100000000}
			/>
		</LabeledControl>
		<Container direction="row">
			<button disabled={busy || missing} onclick={handleSimplify}>
				{busy ? 'Working…' : 'Apply'}
			</button>
			{#if surface.simplify}
				<button disabled={busy} onclick={handleRevert}> Revert to original </button>
			{/if}
		</Container>
	</Container>
</section>

<style>
	.missing {
		padding: 0.5rem;
		border: 1px solid var(--color-warning, #c80);
		margin-bottom: 0.5rem;
	}
	.warning {
		color: var(--color-warning, #c80);
		font-size: 0.85em;
		margin: 0;
	}
</style>
