<script lang="ts">
	import {
		computationMode,
		pausePatternUpdates,
		isManualMode,
		hasPendingChanges
	} from '$lib/stores/uiStores';
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';

	function refreshPatterns() {
		pausePatternUpdates.set(false);
		// Force derived store to re-evaluate by subscribing and immediately unsubscribing.
		// This relies on Svelte's synchronous derived store execution during subscribe.
		superGlobulePatternStore.subscribe(() => {})();
	}
</script>

<Editor>
	<section>
		<header>Computation Mode</header>
		<Container direction="column">
			<label>
				Mode
				<select bind:value={$computationMode}>
					<option value="continuous">Continuous</option>
					<option value="3d-only">3D Only</option>
					<option value="2d-only">2D Only</option>
				</select>
			</label>
			<label>
				<input type="checkbox" bind:checked={$isManualMode} />
				Manual Mode
				{#if $isManualMode && $hasPendingChanges}
					<span class="pending-indicator">⚠ pending</span>
				{/if}
			</label>
			<label>
				<input type="checkbox" bind:checked={$pausePatternUpdates} />
				Pause Pattern Updates
			</label>
			{#if $pausePatternUpdates}
				<button onclick={refreshPatterns}>Refresh</button>
			{/if}
		</Container>
	</section>
</Editor>

<style>
	label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
	}

	.pending-indicator {
		color: #ff9800;
		font-size: 0.75rem;
		font-weight: 600;
	}
</style>
