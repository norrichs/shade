<script lang="ts">
	import { shouldUsePersisted, uiStore, superGlobuleStore } from '$lib/stores';
	import { isManualMode, hasPendingChanges } from '$lib/stores/uiStores';
	import { triggerManualRegeneration, isGenerating } from '$lib/stores/superGlobuleStores';
	import { selectedSurfaceProjection, rotateToSelection } from '$lib/stores/selectionStores';
	import { downloadSvg } from '$lib/util';
	import { interactionMode } from '../three-renderer/interaction-mode';
	import Button from '../design-system/Button.svelte';
	import WorkingIndicator from './WorkingIndicator.svelte';
	import ViewMenu from './ViewMenu.svelte';

	$: regenerateDisabled = !$isManualMode || $isGenerating || !$hasPendingChanges;

	let showModal = false;
	const toggleModal = () => {
		showModal = !showModal;
	};

	// Build band options from surfaceProjectionTubes
	$: bandOptions = (() => {
		const spTubes = $superGlobuleStore.projections?.[0]?.surfaceProjectionTubes;
		if (!spTubes) return [];
		const opts: {
			label: string;
			value: { globule: number; tube: number; band: number; facet: number };
		}[] = [];
		spTubes.forEach((tube, t) => {
			tube.bands.forEach((_, b) => {
				opts.push({
					label: `t${t}b${b}`,
					value: { globule: 0, tube: t, band: b, facet: 0 }
				});
			});
		});
		return opts;
	})();

	$: selectedBandLabel = $selectedSurfaceProjection
		? `t${$selectedSurfaceProjection.tube}b${$selectedSurfaceProjection.band}`
		: '';

	function handleBandSelect(event: Event) {
		const target = event.target as HTMLSelectElement;
		const val = target.value;
		if (!val) {
			$selectedSurfaceProjection = null;
			return;
		}
		const opt = bandOptions.find((o) => o.label === val);
		if (opt) {
			$selectedSurfaceProjection = opt.value;
			// Use tick to ensure store update propagates before rotating
			setTimeout(rotateToSelection, 0);
		}
	}
</script>

<header>
	<nav>
		<div>
			<a href="/designer2">Designer</a>
			<ViewMenu />
		</div>

		<WorkingIndicator />

		<!-- <div>
			{formatAddress($selectedBand)}
		</div> -->

		<!-- {#if $selectedProjectionGeometry}
			<div>
				<span>
					{printProjectionAddress($selectedProjectionGeometry.selected[0])}
				</span>
				{#each $selectedProjectionGeometry.selectedPartners as partner}
					<span>{`[${printProjectionAddress(partner)}]`}</span>
				{/each}
			</div>
		{/if} -->

		<div class="button-group">
			<select class="band-select" value={selectedBandLabel} onchange={handleBandSelect}>
				<option value="">-- band --</option>
				{#each bandOptions as opt}
					<option value={opt.label}>{opt.label}</option>
				{/each}
			</select>
			<Button onclick={rotateToSelection}>Rotate to selection</Button>
			<Button onclick={toggleModal}>Edit</Button>

			{#if $isManualMode}
				<Button
					onclick={triggerManualRegeneration}
					disabled={regenerateDisabled}
					class={$hasPendingChanges && !$isGenerating ? 'pending' : ''}
				>
					{#if $isGenerating}
						Regenerating...
					{:else if $hasPendingChanges}
						Regenerate ⚠
					{:else}
						Regenerate
					{/if}
				</Button>
			{/if}

			<Button
				onclick={() => {
					$interactionMode = { type: 'band-select-multiple', data: { bands: [] } };
				}}>Select Bands</Button
			>
			<Button
				onclick={() => downloadSvg('pattern-svg', `globule-pattern ${$superGlobuleStore.name}.svg`)}
				>Download SVG</Button
			>
			<Button
				onclick={() =>
					($uiStore.designer.viewMode =
						$uiStore.designer.viewMode === 'pattern' ? 'three' : 'pattern')}
				>{`Main: ${$uiStore.designer.viewMode}`}</Button
			>
			<label for="use-persisted-checkbox">persist settings?</label>
			<input type="checkbox" bind:checked={$shouldUsePersisted} />

			<!-- <button> User </button> -->
		</div>
	</nav>
</header>

<style>
	a {
		/* --link-color: green; */
		color: var(--color-link);
	}
	header > nav {
		--padding: 8px;
		--height: calc(var(--nav-header-height) - 2 * var(--padding));
		max-height: var(--height);
		height: var(--height);
		padding: var(--padding);
		font-family: 'Open Sans', sans-serif;
		font-optical-sizing: auto;
		font-weight: 300;
		font-style: normal;
		font-variation-settings: 100;
		font-size: 1.5rem;
		left: 0;
		top: 0;
		right: 0;
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		background-color: rgba(100, 100, 100, 1);
	}
	.button-group {
		display: flex;
		flex-direction: row;
		gap: 12px;
		align-items: center;
	}
	.band-select {
		font-size: 0.9rem;
		padding: 2px 4px;
		max-height: 28px;
	}

	:global(button.pending) {
		background-color: #ff9800;
		animation: pulse-button 2s ease-in-out infinite;
	}

	:global(button:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@keyframes pulse-button {
		0%,
		100% {
			box-shadow: 2px 2px 10px 0px var(--color-shaded-dark);
		}
		50% {
			box-shadow: 0 0 15px 3px rgba(255, 152, 0, 0.6);
		}
	}
</style>
