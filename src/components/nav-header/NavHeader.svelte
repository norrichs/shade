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
		bandContourIndexes,
		exportPagesStore,
		lightburnTemplateStore,
		postProcessConfig
	} from '$lib/stores';
	import { isManualMode, hasPendingChanges } from '$lib/stores/uiStores';
	import { triggerManualRegeneration, isGenerating } from '$lib/stores/superGlobuleStores';
	import { selectedSurfaceProjection, rotateToSelection } from '$lib/stores/selectionStores';
	import { downloadSvg, downloadTextFile, SCREEN_ONLY_SELECTOR } from '$lib/util';
	import { toastStore } from '$lib/stores/toastStore';
	import { exportFrame } from '$lib/download/export-frame';
	import { fileStamp } from '$lib/download/file-stamp';
	import { buildLbProject } from '$lib/lightburn/build-lb-project';
	import { collectDomShapes } from '$lib/lightburn/collect-dom-shapes';
	import { writeLbrn2 } from '$lib/lightburn/lbrn2-writer';
	import { layerByIndex } from '$lib/lightburn/layers';
	import {
		collectExportNodes,
		findUntagged,
		untaggedMessage
	} from '$lib/cut-pattern/export-guard';
	import { interactionMode } from '../three-renderer/interaction-mode';
	import Button from '../design-system/Button.svelte';
	import WorkingIndicator from './WorkingIndicator.svelte';
	import ViewMenu from './ViewMenu.svelte';
	import BandSelectionPanel from '../projection/BandSelectionPanel.svelte';
	import { toBandMergePayloads } from '$lib/cut-pattern/band-merge-payload';
	import { mergeBand, type MergeCtx } from '$lib/cut-pattern/merge-band';
	import { createBandMergePool, isTotalPoolFailure } from '$lib/workers/band-merge-pool';
	import { buildContourIndex, type BandContourIndex } from '$lib/cut-pattern/contour-index';
	import type { PathSegment } from '$lib/types';
	import { collateTubes } from '$lib/cut-pattern/collate-tubes';
	import { get } from 'svelte/store';
	import { buildBandSortIndex } from '$lib/cut-pattern/band-sort-index';
	import { buildPatternCsv } from '$lib/cut-pattern/build-pattern-csv';
	import { tick, onDestroy } from 'svelte';

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

	// Navigating away from /designer2 mid-run must not leave pool workers
	// churning in the background: the component that owns them is gone.
	onDestroy(() => pool.cancel());

	// Invalidate prepared merge state whenever underlying geometry or label
	// config changes. User must re-click "Prepare Download" (or just click
	// Download SVG, which auto-preps) to refresh.
	//
	// Gated on an explicit key rather than on the store subscription itself:
	// `$patternConfigStore` re-fires for ANY field, including the post-process
	// block, whose whole purpose is to change WITHOUT re-merging. Clearing on
	// every emission would make each nudge of a drop chance pay for the union
	// again. `postProcess` is deliberately absent from the key.
	let lastInvalidationKey: string | undefined = undefined;
	let lastPatternRef: unknown = undefined;
	$: {
		const cfg = $patternConfigStore;
		const invalidationKey = JSON.stringify([
			cfg.patternTypeConfig.type,
			cfg.patternTypeConfig.labels?.selfTag,
			cfg.patternViewConfig.bandSortMode,
			cfg.patternConfig.pageLayout.keepConnected,
			cfg.patternConfig.splits
		]);
		// `labelTextDimensions` is owned by PatternLabel and updates reactively
		// when the rendered text bbox changes, so it is not part of the key.
		const patternRef = $superGlobulePatternStore;
		if (invalidationKey !== lastInvalidationKey || patternRef !== lastPatternRef) {
			lastInvalidationKey = invalidationKey;
			lastPatternRef = patternRef;
			mergedBandPathsRaw.set(new Map());
			bandContourIndexes.set(new Map());
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

	// Written together, always: a band holding a path with no index would be
	// silently un-droppable. `mergedBandPaths` derives from both.
	const publish = (paths: Map<string, PathSegment[]>, contours: Map<string, BandContourIndex>) => {
		mergedBandPathsRaw.set(paths);
		bandContourIndexes.set(contours);
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
			const contours = new Map<string, BandContourIndex>();
			for (const payload of payloads) {
				const path = mergeBand(payload, ctx);
				if (path.length === 0) continue;
				paths.set(payload.id, path);
				// Stage 1b, which this branch never reaches a worker to get.
				contours.set(payload.id, buildContourIndex(path, payload, ctx.patternType));
			}
			prepareDone = payloads.length;
			publish(paths, contours);
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
		// A wholesale pool failure (broken worker bundle, CSP block, missing
		// chunk, ...) resolves with every band in `errors` and nothing in
		// `paths`. That must not look like success: publishing an empty map here
		// would pass the `handlePrepare`/auto-prep guard in "Download SVG" and let
		// an un-updated, unprepared file export as if it were ready. A *partial*
		// failure (some bands ok, some not) is not this case and must still
		// publish the bands that succeeded.
		if (isTotalPoolFailure(result, payloads.length)) {
			console.error('[prepare] pool failed entirely; nothing published', [
				...result.errors.entries()
			]);
			return false;
		}
		prepareFailed = result.errors.size;
		if (result.errors.size > 0) {
			console.warn('[prepare] bands failed to merge', [...result.errors.entries()]);
		}
		publish(result.paths, result.contours);
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
		if (!published) {
			// If something external already moved `prepareState` on (the
			// invalidation reactive block on a config/geometry change, or
			// `handleCancelPrepare`), leave it alone — it is already 'idle' and
			// nothing here should stomp on a run that superseded this one.
			// Otherwise this is a run that finished on its own without ever being
			// cancelled or invalidated (e.g. a total pool failure from
			// `isTotalPoolFailure`): nothing else will ever clear the "Preparing…"
			// spinner, so this call must.
			if (prepareState === 'running') prepareState = 'idle';
			return false;
		}
		// Invalidated or superseded mid-run despite `published` being true: leave
		// the state alone (this should not happen in practice, since a
		// superseded run's `wantedGeneration` check in `runPrepare` already
		// returns false, but the guard is cheap insurance).
		if (prepareState !== 'running') return false;
		prepareMs = Math.round(performance.now() - start);
		prepareState = 'done';
		return true;
	};

	const handleCancelPrepare = () => {
		pool.cancel();
		wantedGeneration = 0;
		prepareState = 'idle';
	};

	const handleDownload = async () => {
		// Export only ever ships prepared geometry — for BOTH pattern types.
		if (get(mergedBandPaths).size === 0) {
			if (!(await handlePrepare())) return;
			await tick();
		}
		const pages = get(exportPagesStore);
		if (!pages) {
			toastStore.add({
				type: 'error',
				message: 'Switch the pattern view to page layout to export real-world sizes.'
			});
			return;
		}
		const pp = get(postProcessConfig);
		const stamp = fileStamp(get(superGlobuleStore).name);

		if (pp.downloadFormat === 'lbrn2') {
			const root = document.getElementById('pattern-svg') as SVGSVGElement | null;
			if (!root) return;
			const probe = root.cloneNode(true) as Element;
			probe.querySelectorAll(SCREEN_ONLY_SELECTOR).forEach((n) => n.remove());
			const bad = findUntagged(collectExportNodes(probe));
			if (bad.length) {
				toastStore.add({ type: 'error', message: untaggedMessage(bad) });
				return;
			}
			const project = buildLbProject({
				shapes: collectDomShapes(root),
				pages: pages.pages,
				pageScale: pages.pageScale,
				layerMap: pp.layerMap
			});
			const { xml, missingLayers } = writeLbrn2(project, get(lightburnTemplateStore)?.xml);
			if (missingLayers.length) {
				const ids = missingLayers.map((i) => layerByIndex(i)?.id ?? String(i)).join(', ');
				toastStore.add({
					type: 'warning',
					message: `No template settings for ${ids}; LightBurn defaults apply.`
				});
			}
			downloadTextFile(xml, `${stamp}.lbrn2`, 'application/xml');
			return;
		}

		const result = downloadSvg(`${stamp}.svg`, exportFrame(pages.pages, pages.pageScale));
		if (!result.ok) toastStore.add({ type: 'error', message: result.error });
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
			downloadTextFile(
				csvText,
				`${fileStamp(get(superGlobuleStore).name)} pattern-map.csv`,
				'text/csv'
			);
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
			<Button disabled={prepareState === 'running'} onclick={handleDownload}>
				{$postProcessConfig.downloadFormat === 'lbrn2' ? 'Download LightBurn' : 'Download SVG'}
			</Button>
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
