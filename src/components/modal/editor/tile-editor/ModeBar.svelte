<script lang="ts">
	import type { EditorMode } from './editor-mode';

	let {
		mode,
		onChangeMode
	}: {
		mode: EditorMode;
		onChangeMode: (mode: EditorMode) => void;
	} = $props();

	type ModeOption = { id: EditorMode; label: string };
	const options: ModeOption[] = [
		{ id: 'unit', label: 'Unit' },
		{ id: 'withinBand', label: 'Within Band' },
		{ id: 'acrossBands', label: 'Across Bands' },
		{ id: 'partnerStart', label: 'Partner Start' },
		{ id: 'partnerEnd', label: 'Partner End' },
		{ id: 'skipRemove', label: 'Skip Remove' }
	];
</script>

<div class="mode-bar">
	{#each options as option}
		<button
			class:active={mode === option.id}
			onclick={() => onChangeMode(option.id)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.mode-bar {
		display: flex;
		gap: 4px;
		padding: 6px;
		border-bottom: 1px dotted black;
	}
	.mode-bar button.active {
		background-color: rgba(0, 0, 0, 0.15);
		font-weight: bold;
	}
</style>
