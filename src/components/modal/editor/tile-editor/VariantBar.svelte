<script lang="ts">
	import type { TiledPatternSpec } from '$lib/patterns/spec-types';
	import { algorithms } from '$lib/patterns/pattern-registry';

	let {
		draft,
		isDirty,
		isBuiltIn,
		validationError,
		availableVariants,
		onSelectVariant,
		onSave,
		onSaveAs,
		onDiscard,
		onDelete
	}: {
		draft: TiledPatternSpec | null;
		isDirty: boolean;
		isBuiltIn: boolean;
		validationError: string | null;
		availableVariants: TiledPatternSpec[];
		onSelectVariant: (variantId: string) => void;
		onSave: () => void;
		onSaveAs: (newName: string) => void;
		onDiscard: () => void;
		onDelete: () => void;
	} = $props();

	let saveAsName = $state('');
	let showSaveAsField = $state(false);

	const handleSaveAsClick = () => {
		if (!showSaveAsField) {
			saveAsName = draft ? `${draft.name} (copy)` : 'New variant';
			showSaveAsField = true;
			return;
		}
		if (saveAsName.trim().length === 0) return;
		onSaveAs(saveAsName.trim());
		showSaveAsField = false;
		saveAsName = '';
	};

	const handleSaveAsCancel = () => {
		showSaveAsField = false;
		saveAsName = '';
	};

	const builtInIds = $derived(new Set(algorithms.map((a) => a.defaultSpec.id)));
	const dropdownEntries = $derived([
		...algorithms.map((a) => a.defaultSpec),
		...availableVariants.filter((v) => !builtInIds.has(v.id))
	]);
</script>

<div class="variant-bar">
	<div class="row">
		<select
			value={draft?.id ?? ''}
			onchange={(e) => onSelectVariant((e.target as HTMLSelectElement).value)}
		>
			{#each dropdownEntries as variant}
				<option value={variant.id}>{variant.name}</option>
			{/each}
		</select>
		<button onclick={onSave} disabled={isBuiltIn || !isDirty || validationError !== null}
			>Save</button
		>
		<button onclick={handleSaveAsClick} disabled={!draft || validationError !== null}
			>Save As…</button
		>
		<button onclick={onDiscard} disabled={!isDirty}>Discard</button>
		<button onclick={onDelete} disabled={isBuiltIn || !draft}>Delete</button>
		{#if isDirty}
			<span class="dirty">●</span>
		{/if}
	</div>
	{#if showSaveAsField}
		<div class="row">
			<input bind:value={saveAsName} placeholder="Variant name" />
			<button onclick={handleSaveAsClick} disabled={saveAsName.trim().length === 0}>Confirm</button>
			<button onclick={handleSaveAsCancel}>Cancel</button>
		</div>
	{/if}
	{#if draft}
		<div class="row meta">
			<span class="label">id:</span>
			<code>{draft.id}</code>
			<span class="label">algorithm:</span>
			<code>{draft.algorithm}</code>
		</div>
	{/if}
	{#if validationError}
		<div class="row error">{validationError}</div>
	{/if}
</div>

<style>
	.variant-bar {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px;
		border-bottom: 1px dotted black;
	}
	.row {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.dirty {
		color: red;
		font-weight: bold;
	}
	.label {
		color: rgba(0, 0, 0, 0.5);
	}
	.meta code {
		font-size: 0.85em;
	}
	.error {
		color: #b00020;
		font-size: 0.85em;
	}
</style>
