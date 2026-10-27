<script lang="ts">
	import { patternConfigStore, lightburnTemplateStore } from '#lib/stores/index.js';
	import {
		DEFAULT_CONNECT_GAP_MM,
		defaultDropCurve,
		type HoleDropConfig,
		type HoleDropMode,
		type PageLabelConfig,
		type PostProcessConfig
	} from '#lib/cut-pattern/hole-drop-config.js';
	import {
		addPostProcess,
		deletePostProcess,
		movePostProcess,
		postProcessLabel,
		postProcessList,
		splitPostProcessList
	} from '#lib/cut-pattern/post-process-list.js';
	import {
		GEOMETRY_TYPES,
		GEOMETRY_TYPE_LABELS,
		type GeometryType
	} from '#lib/cut-pattern/post-process-types.js';
	import {
		LIGHTBURN_LAYERS,
		layerOptionLabel,
		resolveLayer,
		type LayerId
	} from '#lib/lightburn/layers.js';
	import { readTemplateUpload, missingTemplateLayers } from '#lib/lightburn/template-status.js';
	import type { BezierConfig } from '#lib/types.js';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import PathEditor from './PathEditor.svelte';
	import { allPointsInUnitSquare } from './path-editor';
	import { selectedPostProcessIndex } from './post-process-editor-store';

	let configs = $derived(postProcessList($patternConfigStore.patternConfig));
	// Clamp so a shrunken list (or an externally loaded config) never leaves the
	// selection out of range.
	let selected = $derived(
		Math.min(Math.max($selectedPostProcessIndex, 0), Math.max(configs.length - 1, 0))
	);
	// Shallow copies, as PageLayout.svelte does: reading the stored object itself
	// would hand `$derived` the same reference on every run, so in-place edits
	// would never propagate to the readouts below.
	let postProcess = $derived({ ...configs[selected] });
	// The layer map and download format are export-wide and live on the first config.
	let exportSettings = $derived({ ...configs[0] });
	let dropHoles = $derived(postProcess.dropHoles);
	let isOutlined = $derived($patternConfigStore.patternTypeConfig.type === 'outlined');

	const MODE_LABELS: Record<HoleDropMode, string> = {
		none: 'none',
		all: 'drop all',
		random: 'randomly drop',
		variable: 'variably drop'
	};

	// Every write goes to the config store, never to component state: Floater
	// fully remounts its panel content on close, so panel-local state is wiped.
	// `exportFrom` is the config whose export settings the stored first entry
	// keeps: the current first one unless the write changes them.
	const writeList = (next: PostProcessConfig[], exportFrom: PostProcessConfig = configs[0]) => {
		const stored = splitPostProcessList(next, exportFrom);
		patternConfigStore.update((config) => {
			config.patternConfig.postProcess = stored.postProcess;
			if (stored.additionalPostProcesses.length)
				config.patternConfig.additionalPostProcesses = stored.additionalPostProcesses;
			else delete config.patternConfig.additionalPostProcesses;
			return config;
		});
	};

	const patch = (next: Partial<PostProcessConfig>) =>
		writeList(configs.map((config, i) => (i === selected ? { ...postProcess, ...next } : config)));

	const patchExport = (next: Pick<PostProcessConfig, 'layerMap' | 'downloadFormat'>) =>
		writeList(configs, { ...exportSettings, ...next });

	const write = (nextDropHoles: HoleDropConfig, runSeed = postProcess.runSeed) =>
		patch({ dropHoles: nextDropHoles, runSeed });

	const setFlag = (flag: 'dropOutline' | 'dropLabelText' | 'disconnectSurround', value: boolean) =>
		patch({ [flag]: value });

	const onAdd = () => {
		writeList(addPostProcess(configs, selected));
		selectedPostProcessIndex.set(selected + 1);
	};
	const onDelete = () => {
		// Compute before writeList: the store (and so `configs`) updates synchronously.
		const next = Math.max(0, Math.min(selected, configs.length - 2));
		writeList(deletePostProcess(configs, selected));
		selectedPostProcessIndex.set(next);
	};
	const onMove = (dir: -1 | 1) => {
		const target = selected + dir;
		if (target < 0 || target >= configs.length) return;
		writeList(movePostProcess(configs, selected, dir));
		selectedPostProcessIndex.set(target);
	};
	let connect = $derived(
		postProcess.connectSurround ?? { enabled: false, gapMm: DEFAULT_CONNECT_GAP_MM }
	);
	let pageLabel = $derived<PageLabelConfig>(
		postProcess.pageLabel ?? { pageNumber: false, configName: false, text: '' }
	);
	const setPageLabel = (next: Partial<PageLabelConfig>) =>
		patch({ pageLabel: { ...pageLabel, ...next } });
	const setLayer = (type: GeometryType, id: LayerId) =>
		patchExport({ layerMap: { ...(exportSettings.layerMap ?? {}), [type]: id } });

	// Transient upload feedback; losing it on panel remount is harmless.
	let templateError = $state('');
	const onTemplate = async (e: Event & { currentTarget: HTMLInputElement }) => {
		// `currentTarget` is only valid while the event is dispatching; the
		// browser nulls it once the handler yields, which the `await` below does.
		const target = e.currentTarget;
		const file = target.files?.[0];
		if (!file) return;
		const result = readTemplateUpload(file.name, await file.text());
		if (result.ok) {
			$lightburnTemplateStore = result.template;
			templateError = '';
		} else templateError = result.error;
		target.value = '';
	};
	let missing = $derived(
		missingTemplateLayers(exportSettings.layerMap, $lightburnTemplateStore?.xml)
	);

	const setMode = (mode: HoleDropMode) => {
		if (mode === dropHoles.mode) return;
		if (mode === 'random') write({ mode, chance: 0.5 });
		else if (mode === 'variable') write({ mode, curve: defaultDropCurve() });
		else write({ mode });
	};

	const setChance = (chance: number) => write({ mode: 'random', chance });
	const setCurve = (curve: BezierConfig[]) => write({ mode: 'variable', curve });
	// Stage 2 is milliseconds, so a reroll re-renders without re-merging.
	const reroll = () => write(dropHoles, postProcess.runSeed + 1);

	// A unit-square canvas. `flipY` puts y=1 at the top, so a curve rising to the
	// right reads as "drop more towards the end of the band".
	const editorConfig = {
		gutter: 0.1,
		padding: 0.1,
		contentBounds: { top: 0, left: 0, width: 1, height: 1 },
		size: { width: 300, height: 300 }
	};
</script>

<Editor>
	<Container direction="column">
		<div class="pp-strip">
			{#each configs as config, i (i)}
				<button
					type="button"
					class="pp-chip"
					class:selected={i === selected}
					onclick={() => selectedPostProcessIndex.set(i)}
				>
					{postProcessLabel(config, i)}
				</button>
			{/each}
			<button type="button" title="Duplicate after selected" onclick={onAdd}>+</button>
			<button
				type="button"
				title="Delete selected"
				disabled={configs.length <= 1}
				onclick={onDelete}>−</button
			>
			<button
				type="button"
				title="Move earlier"
				disabled={selected === 0}
				onclick={() => onMove(-1)}>←</button
			>
			<button
				type="button"
				title="Move later"
				disabled={selected >= configs.length - 1}
				onclick={() => onMove(1)}>→</button
			>
		</div>
		{#if configs.length > 1}
			<p class="hint">Each config adds its own group of pages to the output.</p>
		{/if}
		<LabeledControl label="Name">
			<input
				type="text"
				value={postProcess.name ?? ''}
				placeholder={postProcessLabel(undefined, selected)}
				onchange={(e) => patch({ name: e.currentTarget.value.trim() || undefined })}
			/>
		</LabeledControl>

		<LabeledControl label="Drop label text">
			<input
				type="checkbox"
				checked={postProcess.dropLabelText ?? false}
				onchange={(e) => setFlag('dropLabelText', e.currentTarget.checked)}
			/>
		</LabeledControl>

		{#if isOutlined}
			<p>Outline and hole dropping apply to tiled patterns only.</p>
		{:else}
			<LabeledControl label="Drop outline">
				<input
					type="checkbox"
					checked={postProcess.dropOutline ?? false}
					onchange={(e) => setFlag('dropOutline', e.currentTarget.checked)}
				/>
			</LabeledControl>
			{#if postProcess.dropOutline}
				<p class="hint">Keeps only the holes; the label tag goes with the outline.</p>
			{/if}

			<LabeledControl label="Drop internal holes">
				<select
					value={dropHoles.mode}
					onchange={(e) => setMode(e.currentTarget.value as HoleDropMode)}
				>
					{#each Object.entries(MODE_LABELS) as [mode, label] (mode)}
						<option value={mode}>{label}</option>
					{/each}
				</select>
			</LabeledControl>

			{#if dropHoles.mode === 'random'}
				<LabeledControl label="Drop chance">
					<NumberInput value={dropHoles.chance} min={0} max={1} step={0.01} onChange={setChance} />
				</LabeledControl>
			{/if}

			{#if dropHoles.mode === 'variable'}
				<PathEditor
					flipY
					curveDef={dropHoles.curve}
					onChangeCurveDef={setCurve}
					config={editorConfig}
					limits={[allPointsInUnitSquare]}
					coupling="anchorDragsHandles"
					showCurveTools
					editorId="hole-drop-curve"
				/>
				<p class="hint">x: position along the band · y: chance the hole is dropped</p>
			{/if}

			{#if dropHoles.mode === 'random' || dropHoles.mode === 'variable'}
				<LabeledControl label="Seed {postProcess.runSeed}">
					<button onclick={reroll}>Reroll</button>
				</LabeledControl>
			{/if}
		{/if}

		<h4>Surround</h4>
		<LabeledControl label="Disconnect surround">
			<input
				type="checkbox"
				checked={postProcess.disconnectSurround ?? false}
				onchange={(e) => setFlag('disconnectSurround', e.currentTarget.checked)}
			/>
		</LabeledControl>
		{#if !postProcess.dropOutline}
			<LabeledControl label="Connect surround">
				<input
					type="checkbox"
					checked={connect.enabled}
					onchange={(e) =>
						patch({ connectSurround: { ...connect, enabled: e.currentTarget.checked } })}
				/>
			</LabeledControl>
			{#if connect.enabled}
				<LabeledControl label="Gap (mm)">
					<NumberInput
						value={connect.gapMm}
						min={0.1}
						max={20}
						step={0.1}
						onChange={(gapMm: number) => patch({ connectSurround: { ...connect, gapMm } })}
					/>
				</LabeledControl>
			{/if}
		{/if}

		<h4>Page labels</h4>
		<LabeledControl label="Page number">
			<input
				type="checkbox"
				checked={pageLabel.pageNumber}
				onchange={(e) => setPageLabel({ pageNumber: e.currentTarget.checked })}
			/>
		</LabeledControl>
		<LabeledControl label="Config name">
			<input
				type="checkbox"
				checked={pageLabel.configName}
				onchange={(e) => setPageLabel({ configName: e.currentTarget.checked })}
			/>
		</LabeledControl>
		<LabeledControl label="Text">
			<input
				type="text"
				value={pageLabel.text}
				onchange={(e) => setPageLabel({ text: e.currentTarget.value.trim() })}
			/>
		</LabeledControl>

		<h4>Layers <span class="scope">· all configs</span></h4>
		{#each GEOMETRY_TYPES as type (type)}
			{@const current = resolveLayer(type, exportSettings.layerMap)}
			<LabeledControl label={GEOMETRY_TYPE_LABELS[type]}>
				<span class="swatch" style="background: {current.hex}"></span>
				<select
					value={current.id}
					onchange={(e) => setLayer(type, e.currentTarget.value as LayerId)}
				>
					{#each LIGHTBURN_LAYERS as layer (layer.id)}
						<option value={layer.id}>{layerOptionLabel(layer)}</option>
					{/each}
				</select>
			</LabeledControl>
		{/each}

		<h4>LightBurn <span class="scope">· all configs</span></h4>
		<LabeledControl label="Download as LightBurn">
			<input
				type="checkbox"
				checked={exportSettings.downloadFormat === 'lbrn2'}
				onchange={(e) => patchExport({ downloadFormat: e.currentTarget.checked ? 'lbrn2' : 'svg' })}
			/>
		</LabeledControl>
		<LabeledControl label="Template (.lbrn2)">
			<input type="file" accept=".lbrn2" onchange={onTemplate} />
		</LabeledControl>
		{#if templateError}<p class="error">{templateError}</p>{/if}
		{#if $lightburnTemplateStore}
			<p class="hint">
				{$lightburnTemplateStore.fileName} · loaded {new Date(
					$lightburnTemplateStore.loadedAt
				).toLocaleString()}
			</p>
		{:else}
			<p class="hint">No template: cut settings will use LightBurn defaults.</p>
		{/if}
		{#if missing.length}
			<p class="hint">Not in template: {missing.join(', ')}</p>
		{/if}
	</Container>
</Editor>

<style>
	.pp-strip {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.pp-chip.selected {
		font-weight: bold;
		outline: 2px solid currentColor;
	}
	.scope {
		font-weight: normal;
		font-size: 0.8em;
		opacity: 0.7;
	}
	.swatch {
		display: inline-block;
		width: 0.8em;
		height: 0.8em;
		margin-right: 0.3em;
		border: 1px solid #888;
	}
	.error {
		color: #b00;
		font-size: 0.8em;
		margin: 0;
	}
	h4 {
		margin: 0.6em 0 0.2em;
	}
	.hint {
		font-size: 0.8em;
		opacity: 0.7;
		margin: 0;
	}
</style>
