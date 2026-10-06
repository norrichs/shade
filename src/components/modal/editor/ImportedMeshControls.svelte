<script lang="ts">
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { superConfigStore } from '$lib/stores';
	import { toastStore } from '$lib/stores/toastStore';
	import { assetStatus, resolveAsset } from '$lib/mesh-import/asset-store';
	import {
		applySimplify,
		refit,
		replaceImportedModel,
		revertSimplify
	} from '$lib/mesh-import/import-model';
	import type { MeshAsset } from '$lib/mesh-import/types';
	import type { ImportedSurfaceConfig, UpAxis } from '$lib/projection-geometry/types';
	import LabeledControl from './LabeledControl.svelte';
	import Container from './Container.svelte';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import PointInput from '../../controls/super-control/PointInput.svelte';

	let { surface }: { surface: ImportedSurfaceConfig } = $props();

	const UP_AXES: UpAxis[] = ['+y', '+z', '-y', '-z', '+x', '-x'];

	let asset: MeshAsset | undefined = $state();
	let busy = $state(false);
	let replaceInput: HTMLInputElement | undefined = $state();
	let upAxis: UpAxis = $state(untrack(() => surface.normalize.upAxis));
	let targetSize = $state(untrack(() => surface.normalize.targetSize));
	let targetTriangles = $state(0);

	let missing = $derived($assetStatus[surface.assetId] === 'missing');

	// Load diagnostics whenever the asset changes (import, simplify, revert, re-pick).
	$effect(() => {
		const id = surface.assetId;
		void resolveAsset(id).then((loaded) => {
			if (surface.assetId !== id) return;
			asset = loaded;
			if (loaded) targetTriangles = loaded.diagnostics.triangles;
		});
	});

	$effect(() => {
		upAxis = surface.normalize.upAxis;
		targetSize = surface.normalize.targetSize;
	});

	/**
	 * Write `next` back, keeping the transform currently in the store
	 * (TransformControls binds straight to it, so `surface.transform` may be stale).
	 */
	const commit = (next: ImportedSurfaceConfig) => {
		const config = get(superConfigStore);
		const current = config.projectionConfigs[0].surfaceConfig;
		config.projectionConfigs[0].surfaceConfig = { ...next, transform: current.transform };
		superConfigStore.set(config);
	};

	const run = async (label: string, op: () => Promise<void>) => {
		busy = true;
		try {
			await op();
		} catch (error) {
			toastStore.add({
				type: 'error',
				message: `${label}: ${error instanceof Error ? error.message : String(error)}`,
				dismissible: true
			});
		} finally {
			busy = false;
		}
	};

	const handleReplace = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		await run('Replace model', async () => {
			const { config, sameFile } = await replaceImportedModel(surface, file);
			commit(config);
			if (!sameFile && missing) {
				toastStore.add({
					type: 'warning',
					message: `${file.name} is a different file than originally used — refit applied`,
					duration: 5000
				});
			}
		});
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
		<button
			disabled={busy || missing}
			onclick={() => run('Re-fit', async () => commit(await refit(surface, upAxis, targetSize)))}
		>
			Re-fit
		</button>

		<LabeledControl label="Ray center">
			<PointInput bind:value={() => surface.center, (center) => commit({ ...surface, center })} />
		</LabeledControl>
		<button disabled={busy} onclick={() => commit({ ...surface, center: { x: 0, y: 0, z: 0 } })}>
			Reset to model center
		</button>

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
			<button
				disabled={busy || missing}
				onclick={() =>
					run('Simplify', async () => commit(await applySimplify(surface, targetTriangles)))}
			>
				{busy ? 'Working…' : 'Apply'}
			</button>
			{#if surface.simplify}
				<button disabled={busy} onclick={() => commit(revertSimplify(surface))}>
					Revert to original
				</button>
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
