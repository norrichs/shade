<script lang="ts">
	let {
		onAdd,
		onSplit,
		onRemove,
		canRemove = true
	}: {
		onAdd: () => void;
		onSplit: () => void;
		onRemove: () => void;
		canRemove?: boolean;
	} = $props();
</script>

<div class="toolbar">
	<span class="label">Curves</span>
	<button onclick={onAdd} title="Append a curve">+</button>
	<button onclick={onSplit} title="Split the middle curve in two">sp</button>
	<button onclick={onRemove} disabled={!canRemove} title="Remove the last curve">−</button>
</div>

<style>
	.toolbar {
		display: flex;
		flex-direction: row;
		gap: 6px;
		align-items: center;
	}
	.label {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.85em;
	}
	button {
		min-width: 24px;
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
