<script lang="ts">
	import {
		shouldUsePersisted,
		uiStore,
		superGlobuleStore,
		mergedBandPaths,
		labelTextDimensions,
		superGlobulePatternStore,
		patternConfigStore,
		viewControlStore,
		mergedBandPathsRaw,
		postProcessBandPaths
	} from '$lib/stores';
	import { isManualMode, hasPendingChanges } from '$lib/stores/uiStores';
	import { triggerManualRegeneration, isGenerating } from '$lib/stores/superGlobuleStores';
	import { selectedSurfaceProjection, rotateToSelection } from '$lib/stores/selectionStores';
	import { downloadSvg } from '$lib/util';
	import { interactionMode } from '../three-renderer/interaction-mode';
	import Button from '../design-system/Button.svelte';
	import WorkingIndicator from './WorkingIndicator.svelte';
	import ViewMenu from './ViewMenu.svelte';
	import BandSelectionPanel from '../projection/BandSelectionPanel.svelte';
	import { toBandMergePayloads } from '$lib/cut-pattern/band-merge-payload';
	import { mergeBand, type MergeCtx } from '$lib/cut-pattern/merge-band';
	import { createBandMergePool } from '$lib/workers/band-merge-pool';
	import type { PathSegment } from '$lib/types';
	import { collateTubes } from '$lib/cut-pattern/collate-tubes';
	import { get } from 'svelte/store';
	import { buildBandSortIndex } from '$lib/cut-pattern/band-sort-index';
	import { buildPatternCsv } from '$lib/cut-pattern/build-pattern-csv';
	import { downloadTextFile } from '$lib/util';
	import { tick } from 'svelte';

	$: regenerateDisabled = !$isManualMode || $isGenerating || !$hasPendingChanges;

	// "Prepare Download" runs the per-band merge across a pool of workers, so the
	// page stays interactive. `prepareMs` records the last run's duration.
	let prepareState: 'idle' | 'running' | 'done' = 'idle';
	let prepareMs = 0;
	let prepareDone = 0;
	let prepareTotal = 0;
	let prepareFailed = 0;

	const pool = createBandMergePool();
	// `pool.cancel()` can lose a race with a run's final response, so a
	// superseded run can still resolve with `cancelled: false` and paths
	// computed against geometry that has since changed. Each run therefore takes
	// a local token; `wantedGeneration` names the one run whose result we still
	// want (0 = none), and anything else is dropped unpublished. Purely local —
	// it does not mirror the pool's own generation counter.
	let poolGeneration = 0;
	let wantedGeneration = 0;

	// Invalidate prepared merge state whenever underlying geometry or label
	// config changes. User must re-click "Prepare Download" (or just click
	// Download SVG, which auto-preps) to refresh.
	$: {
		// Reference each dep so Svelte tracks it. Only clear the merged paths —
		// `labelTextDimensions` is owned by PatternLabel and updates reactively
		// when the rendered text bbox changes.
		void $superGlobulePatternStore;
		void $patternConfigStore.patternTypeConfig.type;
		void $patternConfigStore.patternTypeConfig.labels?.selfTag;
		mergedBandPaths.set(new Map());
		mergedBandPathsRaw.set(new Map());
		void $patternConfigStore.patternViewConfig.bandSortMode;
		void $patternConfigStore.patternConfig.pageLayout.keepConnected;
		csvState = 'idle';
		csvText = '';
		// A geometry/config change makes any prepared union stale — including one
		// still being computed. Cancelling is best-effort (it can lose a race with
		// the run's last response), so also drop the generation we are waiting on:
		// whatever that run resolves with must never be published.
		pool.cancel();
		wantedGeneration = 0;
		prepareState = 'idle';
	}

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

	/** Collate, extract payloads and build the per-run merge context. */
	const prepareInputs = (): { payloads: ReturnType<typeof toBandMergePayloads>; ctx: MergeCtx } => {
		const patternState = get(superGlobulePatternStore) as any;
		const config = get(patternConfigStore);
		const view = get(viewControlStore);
		const labelDims = get(labelTextDimensions);
		const tubes = collateTubes({
			globuleTubePattern: patternState.globuleTubePattern,
			projectionPattern: patternState.projectionPattern,
			surfaceProjectionPattern: patternState.surfaceProjectionPattern,
			voronoiPattern: patternState.voronoiPattern,
			voronoiSurfacePattern: patternState.voronoiSurfacePattern,
			showGlobuleTubeGeometry: view.showGlobuleTubeGeometry,
			showProjectionGeometry: view.showProjectionGeometry,
			patternSource: config.patternViewConfig.patternSource ?? 'projection'
		});
		return {
			payloads: toBandMergePayloads(tubes, labelDims),
			ctx: {
				patternType: config.patternTypeConfig.type,
				selfTag: config.patternTypeConfig.labels?.selfTag,
				keepConnected: config.patternConfig.pageLayout.keepConnected ?? 0
			}
		};
	};

	const publish = (paths: Map<string, PathSegment[]>) => {
		mergedBandPathsRaw.set(paths);
		mergedBandPaths.set(postProcessBandPaths(paths));
	};

	/**
	 * Merge every band and publish the result. Small jobs run inline: spawning
	 * workers would cost more than the work. Returns false when the run was
	 * cancelled or superseded, so nothing was published.
	 */
	const runPrepare = async (): Promise<boolean> => {
		const { payloads, ctx } = prepareInputs();
		prepareDone = 0;
		prepareTotal = payloads.length;
		prepareFailed = 0;

		if (payloads.length <= 2) {
			const paths = new Map<string, PathSegment[]>();
			for (const payload of payloads) {
				const path = mergeBand(payload, ctx);
				if (path.length > 0) paths.set(payload.id, path);
			}
			prepareDone = payloads.length;
			publish(paths);
			return true;
		}

		poolGeneration += 1;
		const myGeneration = poolGeneration;
		wantedGeneration = myGeneration;
		const result = await pool.run(payloads, ctx, (done, total) => {
			// A superseded run's progress must not drive the readout for the run
			// that replaced it.
			if (wantedGeneration !== myGeneration) return;
			prepareDone = done;
			prepareTotal = total;
		});
		// `cancelled` alone is not enough: cancel() can lose a race with the run's
		// final response, leaving a superseded run looking like a clean success.
		// The comparison is deliberately against our own local token rather than
		// `result.generation`: equivalent today, but it cannot silently start
		// dropping legitimate results if this component ever grows a second
		// `pool.run` call site and the two counters drift apart.
		if (result.cancelled || wantedGeneration !== myGeneration) return false;
		prepareFailed = result.errors.size;
		if (result.errors.size > 0) {
			console.warn('[prepare] bands failed to merge', [...result.errors.entries()]);
		}
		publish(result.paths);
		return true;
	};

	// The work runs off the main thread now, so there is no frozen frame to paint
	// around — no rAF wait is needed before starting it. Returns whether a merge
	// was actually published, so the auto-prep in "Download SVG" can decline to
	// export an unprepared file.
	const handlePrepare = async (): Promise<boolean> => {
		if (prepareState === 'running') return false;
		prepareState = 'running';
		const start = performance.now();
		let published = false;
		try {
			published = await runPrepare();
		} catch (error) {
			prepareState = 'idle';
			console.error('[prepare] failed', error);
			return false;
		}
		// Cancelled, invalidated or superseded mid-run: leave the state alone.
		if (!published || prepareState !== 'running') return false;
		prepareMs = Math.round(performance.now() - start);
		prepareState = 'done';
		return true;
	};

	const handleCancelPrepare = () => {
		pool.cancel();
		wantedGeneration = 0;
		prepareState = 'idle';
	};

	type CsvState = 'idle' | 'ready';
	let csvState: CsvState = 'idle';
	let csvText = '';

	const buildTubesForCsv = () => {
		const patternState = get(superGlobulePatternStore) as any;
		const config = get(patternConfigStore);
		const view = get(viewControlStore);
		return collateTubes({
			globuleTubePattern: patternState.globuleTubePattern,
			projectionPattern: patternState.projectionPattern,
			surfaceProjectionPattern: patternState.surfaceProjectionPattern,
			voronoiPattern: patternState.voronoiPattern,
			voronoiSurfacePattern: patternState.voronoiSurfacePattern,
			showGlobuleTubeGeometry: view.showGlobuleTubeGeometry,
			showProjectionGeometry: view.showProjectionGeometry,
			patternSource: config.patternViewConfig.patternSource ?? 'projection'
		});
	};

	const handleCsvClick = () => {
		if (csvState === 'idle') {
			const config = get(patternConfigStore);
			const mode = config.patternViewConfig.bandSortMode ?? 'tube-order';
			const tubes = buildTubesForCsv();
			const index = buildBandSortIndex(tubes, mode);
			csvText = buildPatternCsv(index, tubes);
			csvState = 'ready';
		} else {
			downloadTextFile(csvText, `pattern-map ${get(superGlobuleStore).name}.csv`, 'text/csv');
		}
	};

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
		<div class="left-group">
			<a href="/designer2">Designer</a>
			<a href="/assembler">Assembler</a>
			<ViewMenu />
			<BandSelectionPanel />
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
			<Button onclick={handlePrepare} disabled={prepareState === 'running'}>
				{prepareState === 'running' ? 'Preparing…' : 'Prepare Download'}
			</Button>
			{#if prepareState === 'running'}
				<span class="prepare-status running">
					{prepareTotal > 0 ? `preparing ${prepareDone} / ${prepareTotal} bands` : '…preparing'}
				</span>
				<Button onclick={handleCancelPrepare}>Cancel</Button>
			{:else if prepareState === 'done'}
				<span class="prepare-status done">
					✓ ready ({prepareMs} ms{prepareFailed > 0 ? `, ${prepareFailed} failed` : ''})
				</span>
			{/if}
			<Button
				disabled={prepareState === 'running'}
				onclick={async () => {
					if (
						$patternConfigStore.patternTypeConfig.type === 'outlined' &&
						$mergedBandPaths.size === 0
					) {
						// Exporting the un-updated DOM would hand the user an unprepared
						// cut file that looks like a prepared one.
						if (!(await handlePrepare())) return;
						await tick();
					}
					downloadSvg('pattern-svg', `globule-pattern ${$superGlobuleStore.name}.svg`);
				}}>Download SVG</Button
			>
			<Button onclick={handleCsvClick}>
				{csvState === 'idle' ? 'Make CSV' : 'Download CSV'}
			</Button>
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
	.prepare-status {
		display: inline-flex;
		align-items: center;
		padding: 0 8px;
		font-size: 0.85rem;
		white-space: nowrap;
	}
	.prepare-status.running {
		color: var(--color-text-muted, #ccc);
		font-style: italic;
		animation: prepare-pulse 1.5s ease-in-out infinite;
	}
	.prepare-status.done {
		color: #4caf50;
	}
	@keyframes prepare-pulse {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 1;
		}
	}

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
	.left-group {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 12px;
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
