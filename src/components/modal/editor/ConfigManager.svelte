<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import { triggerManualRegeneration } from '$lib/stores/superGlobuleStores';
	import { isManualMode } from '$lib/stores/uiStores';
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

	let configName = '';
	let configs: ConfigEntry[] = [];
	let loading = false;
	let saving = false;
	let error = '';
	let confirmDeleteId: number | null = null;

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
			const res = await fetch('/api/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: configName.trim(),
					configJson: JSON.stringify($superConfigStore)
				})
			});
			if (!res.ok) throw new Error('Failed to save config');
			configName = '';
			await fetchConfigs();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save config';
		} finally {
			saving = false;
		}
	}

	async function loadConfig(id: number) {
		error = '';
		try {
			const res = await fetch(`/api/config/${id}`);
			if (!res.ok) throw new Error('Failed to load config');
			const data = await res.json();
			const parsed = JSON.parse(data.configJson);
			superConfigStore.set(parsed);
			if (get(isManualMode)) {
				triggerManualRegeneration();
			}
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
			<LabeledControl label="Name">
				<input type="text" bind:value={configName} placeholder="Config name" />
			</LabeledControl>
			<Button onclick={saveConfig} disabled={saving || !configName.trim()}>
				{saving ? 'Saving...' : 'Save'}
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
					<div class="config-row">
						<span class="config-name">{config.name}</span>
						<div class="config-actions">
							<Button onclick={() => loadConfig(config.id)}>Load</Button>
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
