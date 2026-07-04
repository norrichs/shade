<script lang="ts">
	import { superConfigStore, patternConfigStore, viewControlStore } from '$lib/stores';
	import { loadedConfigStore } from '$lib/stores/loadedConfigStore';
	import { triggerManualRegeneration } from '$lib/stores/superGlobuleStores';
	import { isManualMode } from '$lib/stores/uiStores';
	import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
	import {
		buildSavedConfig,
		parseSavedConfig,
		collectReferencedTilePatternSpecs
	} from '$lib/saved-config';
	import type { SuperGlobuleConfig, GlobulePatternConfig } from '$lib/types';
	import type { ViewControls } from '$lib/stores/viewControlStore';
	import type { TiledPatternSpec } from '$lib/patterns/spec-types';
	import { get } from 'svelte/store';
	import Button from '../../design-system/Button.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';

	type ConfigEntry = {
		id: number;
		name: string;
		createdAt: string;
		updatedAt: string;
	};

	let configName = $state('');
	let configs: ConfigEntry[] = $state([]);
	let loading = $state(false);
	let saving = $state(false);
	let error = $state('');
	let confirmDeleteId: number | null = $state(null);

	// The loaded config lives in a module-level store (see loadedConfigStore) so
	// it survives this panel unmounting when the user switches panels to edit.
	// `confirmOverwrite` is ephemeral UI state and can reset on remount.
	let confirmOverwrite = $state(false);
	let overwriting = $state(false);

	/** Serialize the given config state exactly as it would be persisted. */
	function serializeConfig(
		superConfig: SuperGlobuleConfig,
		patternConfig: GlobulePatternConfig,
		viewControls: ViewControls,
		variants: TiledPatternSpec[]
	): string {
		const tilePatternSpecs = collectReferencedTilePatternSpecs(patternConfig, variants);
		return JSON.stringify(
			buildSavedConfig(superConfig, patternConfig, viewControls, tilePatternSpecs)
		);
	}

	/** Snapshot the live stores (used at load / overwrite time). */
	function captureCurrentConfig(): string {
		return serializeConfig(
			get(superConfigStore),
			get(patternConfigStore),
			get(viewControlStore),
			get(tilePatternSpecStore).variants
		);
	}

	// Reactive serialization of the working config, so `isModified` updates as the
	// user edits. Mirrors `captureCurrentConfig` but tracks the stores reactively.
	let currentJson = $derived(
		serializeConfig(
			$superConfigStore,
			$patternConfigStore,
			$viewControlStore,
			$tilePatternSpecStore.variants
		)
	);
	let isModified = $derived(
		$loadedConfigStore !== null && currentJson !== $loadedConfigStore.snapshot
	);

	async function fetchConfigs() {
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/config');
			if (!res.ok) throw new Error('Failed to fetch configs');
			configs = await res.json();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch configs';
		} finally {
			loading = false;
		}
	}

	async function saveConfig() {
		if (!configName.trim()) return;
		saving = true;
		error = '';
		try {
			const name = configName.trim();
			const configJson = captureCurrentConfig();
			const res = await fetch('/api/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, configJson })
			});
			if (!res.ok) throw new Error('Failed to save config');
			// Treat the just-saved config as the loaded one, so a subsequent "Save"
			// overwrites it and the modified indicator resets.
			const { id } = await res.json();
			if (typeof id === 'number') {
				loadedConfigStore.set({ id, name, snapshot: configJson });
			}
			configName = '';
			await fetchConfigs();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save config';
		} finally {
			saving = false;
		}
	}

	async function overwriteConfig() {
		const loaded = get(loadedConfigStore);
		if (loaded === null) return;
		overwriting = true;
		error = '';
		try {
			const configJson = captureCurrentConfig();
			const res = await fetch(`/api/config/${loaded.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: loaded.name, configJson })
			});
			if (!res.ok) throw new Error('Failed to overwrite config');
			// Reset the baseline so the config reads as unmodified again.
			loadedConfigStore.set({ id: loaded.id, name: loaded.name, snapshot: configJson });
			confirmOverwrite = false;
			await fetchConfigs();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to overwrite config';
		} finally {
			overwriting = false;
		}
	}

	async function loadConfig(id: number, name: string) {
		error = '';
		try {
			const res = await fetch(`/api/config/${id}`);
			if (!res.ok) throw new Error('Failed to load config');
			const data = await res.json();
			const { superGlobuleConfig, globulePatternConfig, viewControls, tilePatternSpecs } =
				parseSavedConfig(data.configJson);
			// Register embedded custom specs before applying the pattern config so
			// generation can resolve them (no-ops for ids already in the registry).
			tilePatternSpecStore.ensureRegistered(tilePatternSpecs);
			superConfigStore.set(superGlobuleConfig);
			if (globulePatternConfig) {
				patternConfigStore.set(globulePatternConfig);
			}
			if (viewControls) {
				viewControlStore.set(viewControls);
			}
			if (get(isManualMode)) {
				triggerManualRegeneration();
			}
			// Track this as the loaded config and baseline its snapshot from the live
			// stores (not the raw stored JSON) so it reads as unmodified right away,
			// regardless of key ordering / migration during parse.
			loadedConfigStore.set({ id, name, snapshot: captureCurrentConfig() });
			confirmOverwrite = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load config';
		}
	}

	async function deleteConfig(id: number) {
		error = '';
		try {
			const res = await fetch(`/api/config/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete config');
			confirmDeleteId = null;
			// If the loaded config was deleted, forget it — there's nothing to overwrite.
			if (get(loadedConfigStore)?.id === id) {
				loadedConfigStore.set(null);
				confirmOverwrite = false;
			}
			await fetchConfigs();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to delete config';
		}
	}

	fetchConfigs();
</script>

<Editor>
	<section>
		<header>Save Config</header>
		<Container direction="column">
			{#if $loadedConfigStore !== null}
				<div class="loaded-row">
					<span class="loaded-label">
						Loaded: <strong>{$loadedConfigStore.name}</strong>{#if isModified}<span
								class="modified"
								title="Unsaved changes"
							>
								• modified</span
							>{/if}
					</span>
					{#if confirmOverwrite}
						<div class="config-actions">
							<span class="confirm-text">Overwrite “{$loadedConfigStore.name}”?</span>
							<Button onclick={overwriteConfig} disabled={overwriting}>
								{overwriting ? 'Saving...' : 'Confirm'}
							</Button>
							<Button onclick={() => (confirmOverwrite = false)} disabled={overwriting}>
								Cancel
							</Button>
						</div>
					{:else}
						<Button onclick={() => (confirmOverwrite = true)} disabled={!isModified}>Save</Button>
					{/if}
				</div>
			{/if}
			<LabeledControl label="Name">
				<input type="text" bind:value={configName} placeholder="Config name" />
			</LabeledControl>
			<Button onclick={saveConfig} disabled={saving || !configName.trim()}>
				{saving ? 'Saving...' : 'Save as'}
			</Button>
		</Container>
	</section>

	<section>
		<header>Saved Configs</header>
		<Container direction="column">
			{#if error}
				<div class="error">{error}</div>
			{/if}
			{#if loading}
				<div>Loading...</div>
			{:else if configs.length === 0}
				<div class="empty">No saved configs</div>
			{:else}
				{#each configs as config (config.id)}
					<div class="config-row" class:loaded={$loadedConfigStore?.id === config.id}>
						<span class="config-name">{config.name}</span>
						<div class="config-actions">
							<Button onclick={() => loadConfig(config.id, config.name)}>Load</Button>
							{#if confirmDeleteId === config.id}
								<Button onclick={() => deleteConfig(config.id)}>Confirm</Button>
								<Button onclick={() => (confirmDeleteId = null)}>Cancel</Button>
							{:else}
								<Button onclick={() => (confirmDeleteId = config.id)}>Delete</Button>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</Container>
	</section>
</Editor>

<style>
	input[type='text'] {
		padding: 4px 8px;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-family: monospace;
		font-size: 0.875rem;
		flex: 1;
	}

	.config-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		padding: 4px 0;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		gap: 8px;
	}

	.config-name {
		font-size: 0.875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}

	.config-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
		align-items: center;
	}

	.loaded-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}

	.loaded-label {
		font-size: 0.875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.modified {
		color: #d17b00;
		font-style: italic;
	}

	.confirm-text {
		font-size: 0.75rem;
		color: #666;
	}

	.config-row.loaded {
		background-color: rgba(0, 0, 0, 0.04);
	}

	.error {
		color: #d32f2f;
		font-size: 0.75rem;
		padding: 4px;
	}

	.empty {
		font-size: 0.875rem;
		color: #666;
		padding: 8px 0;
	}
</style>
