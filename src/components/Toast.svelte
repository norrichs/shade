<script lang="ts">
	import { toastStore } from '$lib/stores/toastStore';
	import { fade, fly } from 'svelte/transition';

	function handleDismiss(id: string) {
		toastStore.remove(id);
	}

	function getIcon(type: string) {
		switch (type) {
			case 'error':
				return '❌';
			case 'warning':
				return '⚠️';
			case 'success':
				return '✓';
			case 'info':
				return 'ℹ️';
			default:
				return '';
		}
	}
</script>

<div class="toast-container">
	{#each $toastStore as toast (toast.id)}
		<div
			class="toast toast-{toast.type}"
			in:fly={{ y: -20, duration: 200 }}
			out:fade={{ duration: 200 }}
		>
			<span class="toast-icon">{getIcon(toast.type)}</span>
			<span class="toast-message">{toast.message}</span>
			{#if toast.dismissible !== false}
				<button class="toast-dismiss" on:click={() => handleDismiss(toast.id)} aria-label="Dismiss">
					×
				</button>
			{/if}
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		top: 60px;
		right: 20px;
		z-index: 10000;
		display: flex;
		flex-direction: column;
		gap: 10px;
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 300px;
		max-width: 500px;
		padding: 12px 16px;
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		font-family: monospace;
		font-size: 14px;
		background: white;
		border-left: 4px solid;
	}

	.toast-error {
		border-left-color: #f44336;
		background: #ffebee;
	}

	.toast-warning {
		border-left-color: #ff9800;
		background: #fff3e0;
	}

	.toast-success {
		border-left-color: #4caf50;
		background: #e8f5e9;
	}

	.toast-info {
		border-left-color: #2196f3;
		background: #e3f2fd;
	}

	.toast-icon {
		font-size: 18px;
		flex-shrink: 0;
	}

	.toast-message {
		flex: 1;
		word-wrap: break-word;
	}

	.toast-dismiss {
		background: none;
		border: none;
		font-size: 24px;
		line-height: 1;
		cursor: pointer;
		color: #666;
		padding: 0;
		width: 24px;
		height: 24px;
		flex-shrink: 0;
	}

	.toast-dismiss:hover {
		color: #000;
	}
</style>
