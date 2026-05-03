<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
	import { algorithms } from '$lib/patterns/pattern-registry';
	import type { TiledPatternSpec, UnitDefinition } from '$lib/patterns/spec-types';
	import type { PatternTypeConfig, TiledPatternConfig } from '$lib/types';
	import { isTiledPatternConfig } from '$lib/types';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import { get } from 'svelte/store';
	import Editor from './Editor.svelte';
	import Container from './Container.svelte';
	import SegmentPathEditor from './SegmentPathEditor.svelte';
	import UnitToolbar, { type UnitTool } from './tile-editor/UnitToolbar.svelte';
	import VariantBar from './tile-editor/VariantBar.svelte';
	import ModeBar from './tile-editor/ModeBar.svelte';
	import type { EditorMode } from './tile-editor/editor-mode';
	import type { PathEditorConfig } from './path-editor-shared';
	import RuleEditViewport from './tile-editor/RuleEditViewport.svelte';
	import RuleList from './tile-editor/RuleList.svelte';
	import { isRuleMode } from './tile-editor/editor-mode';
	import type { Vertex } from './segment-vertices';
	import { addRuleForPairing, removeRulesForPairing, flatIndexes } from './vertex-addressing';
	import type { Group } from './vertex-topology';
	import { addVertex, removeVertex } from './vertex-topology';
	import type { IndexPair } from '$lib/patterns/spec-types';
	import SkipRemoveViewport from './tile-editor/SkipRemoveViewport.svelte';
	import PartnerPairChooser from './tile-editor/PartnerPairChooser.svelte';
	import type { ResolvedPair } from './tile-editor/partner-pair-resolver';

	let draft: TiledPatternSpec | null = $state(null);
	let mode: EditorMode = $state('unit');
	let tool: UnitTool = $state('drag');
	let group: Group = $state('start');
	let selectedTarget: Vertex | null = $state(null);
	let selectedConnection: { sourceVertex: Vertex; targetVertex: Vertex } | null = $state(null);
	let distortedGhost: ResolvedPair | null = $state(null);

	const handleDistortedGhostChange = (snapshot: ResolvedPair | null) => {
		distortedGhost = snapshot;
	};

	const isShieldVariant = $derived.by(() => {
		const d: TiledPatternSpec | null = draft;
		return d !== null && d.algorithm === 'shield-tesselation';
	});
	const isPartnerMode = $derived.by(() => {
		const m: EditorMode = mode;
		return m === 'partnerStart' || m === 'partnerEnd';
	});

	const handleSelectConnectionLine = (
		conn: { sourceVertex: Vertex; targetVertex: Vertex } | null
	) => {
		selectedConnection = conn;
	};

	const getRulesForMode = (): IndexPair[] => {
		if (!draft) return [];
		if (mode === 'withinBand') return draft.adjustments.withinBand;
		if (mode === 'acrossBands') return draft.adjustments.acrossBands;
		if (mode === 'partnerStart') return draft.adjustments.partner.startEnd;
		if (mode === 'partnerEnd') return draft.adjustments.partner.endEnd;
		return [];
	};

	const setRulesForMode = (newRules: IndexPair[]) => {
		if (!draft) return;
		const updated: TiledPatternSpec = $state.snapshot(draft) as TiledPatternSpec;
		const cleanRules: IndexPair[] = newRules.map((r) => ({ source: r.source, target: r.target }));
		if (mode === 'withinBand') updated.adjustments.withinBand = cleanRules;
		else if (mode === 'acrossBands') updated.adjustments.acrossBands = cleanRules;
		else if (mode === 'partnerStart') updated.adjustments.partner.startEnd = cleanRules;
		else if (mode === 'partnerEnd') updated.adjustments.partner.endEnd = cleanRules;
		draft = updated;
		isDirty = true;
	};

	const handleSelectTarget = (vertex: Vertex) => {
		selectedTarget = vertex;
	};

	const handleSelectGhost = (vertex: Vertex) => {
		if (!draft || !selectedTarget) return;
		const newRules = addRuleForPairing(getRulesForMode(), draft.unit, selectedTarget, vertex);
		setRulesForMode(newRules);
		selectedTarget = null;
	};

	const handleSelectConnection = (sourceVertex: Vertex, targetVertex: Vertex) => {
		if (!draft) return;
		const newRules = removeRulesForPairing(
			getRulesForMode(),
			draft.unit,
			targetVertex,
			sourceVertex
		);
		setRulesForMode(newRules);
	};

	const handleDeleteRuleByIndex = (index: number) => {
		const rules = getRulesForMode();
		const newRules = rules.filter((_, i) => i !== index);
		setRulesForMode(newRules);
	};

	const handleToggleSkip = (vertex: Vertex) => {
		if (!draft) return;
		const indices = flatIndexes(draft.unit, vertex);
		const current = new Set(draft.adjustments.skipRemove);
		const allIn = indices.every((i) => current.has(i));
		for (const i of indices) {
			if (allIn) current.delete(i);
			else current.add(i);
		}
		const updated: TiledPatternSpec = $state.snapshot(draft) as TiledPatternSpec;
		updated.adjustments.skipRemove = Array.from(current).sort((a, b) => a - b);
		draft = updated;
		isDirty = true;
	};

	let storedRowId: number | null = $state(null);
	let isBuiltIn: boolean = $state(false);
	let isDirty: boolean = $state(false);

	const activeVariantId = $derived($patternConfigStore.patternTypeConfig?.type ?? '');
	const variantList = $derived($tilePatternSpecStore.variants);

	const findSpec = (
		variantId: string
	): { spec: TiledPatternSpec; rowId: number | null; builtIn: boolean } | null => {
		const builtIn = algorithms.find((a) => a.defaultSpec.id === variantId);
		if (builtIn) return { spec: builtIn.defaultSpec, rowId: null, builtIn: true };
		const stored = variantList.find((v) => v.id === variantId);
		if (stored) {
			const { rowId, ...specOnly } = stored;
			return {
				spec: specOnly as TiledPatternSpec,
				rowId,
				builtIn: false
			};
		}
		return null;
	};

	$effect(() => {
		const found = findSpec(activeVariantId);
		if (!found) {
			draft = null;
			storedRowId = null;
			isBuiltIn = false;
			isDirty = false;
			return;
		}
		if (isDirty && draft && draft.id === found.spec.id) {
			return;
		}
		draft = $state.snapshot(found.spec) as TiledPatternSpec;
		storedRowId = found.rowId;
		isBuiltIn = found.builtIn;
		isDirty = false;
	});

	const handleUnitChange = (newUnit: UnitDefinition) => {
		if (!draft) return;
		draft = { ...draft, unit: newUnit };
		isDirty = true;
	};

	const handleAddVertex = (x: number, y: number) => {
		if (!draft) return;
		const next = addVertex($state.snapshot(draft) as TiledPatternSpec, group, x, y);
		draft = next;
		isDirty = true;
	};

	const handleRemoveVertex = (vertex: Vertex) => {
		if (!draft) return;
		const next = removeVertex($state.snapshot(draft) as TiledPatternSpec, vertex);
		draft = next;
		isDirty = true;
	};

	const handleSave = async () => {
		if (!draft || isBuiltIn || storedRowId === null || validationError !== null) return;
		const snapshot = $state.snapshot(draft) as TiledPatternSpec;
		const ok = await tilePatternSpecStore.update(storedRowId, snapshot);
		if (ok) isDirty = false;
	};

	const setActiveVariant = (variantId: string) => {
		const store = get(patternConfigStore);
		const existing = store.patternTypeConfig;

		const direct = tiledPatternConfigs[variantId];
		let next: TiledPatternConfig;
		if (direct) {
			next = { ...direct };
		} else {
			const variant = get(tilePatternSpecStore).variants.find((v) => v.id === variantId);
			const algorithm = algorithms.find((a) => a.algorithmId === variant?.algorithm);
			const builtInId = algorithm?.defaultSpec.id;
			const base =
				(builtInId && tiledPatternConfigs[builtInId]) ||
				tiledPatternConfigs['tiledShieldTesselationPattern'];
			next = { ...base, type: variantId };
		}

		if (isTiledPatternConfig(existing) && existing.config) {
			next = { ...next, config: existing.config };
		}

		store.patternTypeConfig = next as PatternTypeConfig;
		patternConfigStore.set(store);
	};

	const handleSaveAs = async (newName: string) => {
		if (!draft || validationError !== null) return;
		const draftSnapshot = $state.snapshot(draft) as TiledPatternSpec;
		const newSpec: TiledPatternSpec = {
			...draftSnapshot,
			id: crypto.randomUUID(),
			name: newName,
			builtIn: false
		};
		const variant = await tilePatternSpecStore.create(newSpec);
		if (!variant) return;
		setActiveVariant(variant.id);
	};

	const handleDiscard = () => {
		selectedTarget = null;
		selectedConnection = null;
		distortedGhost = null;
		const found = findSpec(activeVariantId);
		if (!found) return;
		draft = $state.snapshot(found.spec) as TiledPatternSpec;
		storedRowId = found.rowId;
		isBuiltIn = found.builtIn;
		isDirty = false;
	};

	const handleDelete = async () => {
		if (!draft || isBuiltIn || storedRowId === null) return;
		const ok = await tilePatternSpecStore.remove(storedRowId);
		if (!ok) return;
		const fallbackId = algorithms[0]?.defaultSpec.id ?? '';
		setActiveVariant(fallbackId);
	};

	const handleSelectVariant = (variantId: string) => {
		if (isDirty) {
			const proceed = window.confirm(
				'You have unsaved changes. Switching variants will discard them. Continue?'
			);
			if (!proceed) return;
		}
		selectedTarget = null;
		selectedConnection = null;
		distortedGhost = null;
		setActiveVariant(variantId);
	};

	const updateModeAndClearSelection = (newMode: EditorMode) => {
		mode = newMode;
		tool = 'drag';
		selectedTarget = null;
		selectedConnection = null;
		distortedGhost = null;
	};

	const validationError = $derived.by(() => {
		if (!draft) return null;
		if (draft.unit.start.length === 0) return 'start group must have at least 1 segment';
		if (draft.unit.middle.length === 0) return 'middle group must have at least 1 segment';
		if (draft.unit.end.length === 0) return 'end group must have at least 1 segment';
		return null;
	});

	const editorConfig: PathEditorConfig = $derived.by(() => {
		const currentDraft: TiledPatternSpec | null = draft;
		const unitWidth = currentDraft?.unit.width ?? 42;
		const unitHeight = currentDraft?.unit.height ?? 14;
		const padding = 4;

		let left = -2;
		let top = -2;
		let contentWidth = unitWidth + 4;
		let contentHeight = unitHeight + 4;

		if (mode === 'withinBand' || mode === 'partnerEnd') {
			contentHeight = 2 * unitHeight + 4;
		} else if (mode === 'partnerStart') {
			top = -unitHeight - 2;
			contentHeight = 2 * unitHeight + 4;
		} else if (mode === 'acrossBands') {
			left = -unitWidth - 2;
			contentWidth = 2 * unitWidth + 4;
		}

		const viewBoxWidth = contentWidth + padding * 2;
		const viewBoxHeight = contentHeight + padding * 2;
		const maxSizeWidth = 800;
		const maxSizeHeight = 500;
		const aspect = viewBoxWidth / viewBoxHeight;
		let sizeWidth = maxSizeWidth;
		let sizeHeight = sizeWidth / aspect;
		if (sizeHeight > maxSizeHeight) {
			sizeHeight = maxSizeHeight;
			sizeWidth = sizeHeight * aspect;
		}

		return {
			padding,
			gutter: 0,
			contentBounds: { top, left, width: contentWidth, height: contentHeight },
			size: { width: sizeWidth, height: sizeHeight }
		};
	});
</script>

<Editor>
	<section>
		<header>Tile Editor</header>
		<Container direction="column">
			<VariantBar
				{draft}
				{isDirty}
				{isBuiltIn}
				{validationError}
				availableVariants={variantList}
				onSelectVariant={handleSelectVariant}
				onSave={handleSave}
				onSaveAs={handleSaveAs}
				onDiscard={handleDiscard}
				onDelete={handleDelete}
			/>
			<ModeBar {mode} onChangeMode={updateModeAndClearSelection} />
			{#if draft}
				{#if mode === 'unit'}
					<UnitToolbar
						{tool}
						{group}
						onChangeTool={(t) => (tool = t)}
						onChangeGroup={(g) => (group = g)}
					/>
					<div class="viewport-wrap">
						<SegmentPathEditor
							unit={draft.unit}
							config={editorConfig}
							{tool}
							onChangeUnit={handleUnitChange}
							onAddVertex={handleAddVertex}
							onRemoveVertex={handleRemoveVertex}
						/>
					</div>
				{:else if isRuleMode(mode)}
					{#if isPartnerMode && isShieldVariant}
						<PartnerPairChooser mode={mode as 'partnerStart' | 'partnerEnd'} onChange={handleDistortedGhostChange} />
					{/if}
					<div class="rule-row">
						<div class="viewport-wrap">
							<RuleEditViewport
								spec={draft}
								{mode}
								rules={getRulesForMode()}
								config={editorConfig}
								{selectedTarget}
								{selectedConnection}
								{distortedGhost}
								onSelectTarget={handleSelectTarget}
								onSelectGhost={handleSelectGhost}
								onSelectConnection={handleSelectConnection}
								onSelectConnectionLine={handleSelectConnectionLine}
							/>
						</div>
						<RuleList rules={getRulesForMode()} onDelete={handleDeleteRuleByIndex} />
					</div>
				{:else if mode === 'skipRemove'}
					<div class="viewport-wrap">
						<SkipRemoveViewport
							spec={draft}
							config={editorConfig}
							onToggleVertex={handleToggleSkip}
						/>
					</div>
				{/if}
			{:else}
				<div class="empty">No variant selected.</div>
			{/if}
		</Container>
	</section>
</Editor>

<style>
	.viewport-wrap {
		padding: 8px;
	}
	.empty {
		padding: 16px;
		color: rgba(0, 0, 0, 0.5);
	}
	.rule-row {
		display: flex;
		flex-direction: row;
	}
</style>
