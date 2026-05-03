<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
	import { algorithms } from '$lib/patterns/pattern-registry';
	import type { TiledPatternSpec, UnitDefinition } from '$lib/patterns/spec-types';
	import type { PatternTypeConfig } from '$lib/types';
	import { get } from 'svelte/store';
	import Editor from './Editor.svelte';
	import Container from './Container.svelte';
	import SegmentPathEditor from './SegmentPathEditor.svelte';
	import VariantBar from './tile-editor/VariantBar.svelte';
	import ModeBar from './tile-editor/ModeBar.svelte';
	import type { EditorMode } from './tile-editor/editor-mode';
	import type { PathEditorConfig } from './path-editor-shared';
	import RuleEditViewport from './tile-editor/RuleEditViewport.svelte';
	import { isRuleMode } from './tile-editor/editor-mode';
	import type { Vertex } from './segment-vertices';
	import { addRuleForPairing, removeRulesForPairing } from './vertex-addressing';
	import type { IndexPair } from '$lib/patterns/spec-types';

	let draft: TiledPatternSpec | null = $state(null);
	let mode: EditorMode = $state('unit');
	let selectedTarget: Vertex | null = $state(null);

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
		const newRules = removeRulesForPairing(getRulesForMode(), draft.unit, targetVertex, sourceVertex);
		setRulesForMode(newRules);
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

	const handleSave = async () => {
		if (!draft || isBuiltIn || storedRowId === null) return;
		const snapshot = $state.snapshot(draft) as TiledPatternSpec;
		const ok = await tilePatternSpecStore.update(storedRowId, snapshot);
		if (ok) isDirty = false;
	};

	const setActiveVariant = (variantId: string) => {
		const config = get(patternConfigStore);
		config.patternTypeConfig = {
			...config.patternTypeConfig,
			type: variantId
		} as PatternTypeConfig;
		patternConfigStore.set(config);
	};

	const handleSaveAs = async (newName: string) => {
		if (!draft) return;
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
		setActiveVariant(variantId);
	};

	const updateModeAndClearSelection = (newMode: EditorMode) => {
		mode = newMode;
		selectedTarget = null;
	};

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
			contentWidth = 2 * unitWidth + 4;
		} else if (mode === 'partnerStart') {
			left = -unitWidth - 2;
			contentWidth = 2 * unitWidth + 4;
		} else if (mode === 'acrossBands') {
			top = -unitHeight - 2;
			contentHeight = 2 * unitHeight + 4;
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
					<div class="viewport-wrap">
						<SegmentPathEditor
							unit={draft.unit}
							config={editorConfig}
							onChangeUnit={handleUnitChange}
						/>
					</div>
				{:else if isRuleMode(mode)}
					<div class="viewport-wrap">
						<RuleEditViewport
							spec={draft}
							{mode}
							rules={getRulesForMode()}
							config={editorConfig}
							{selectedTarget}
							onSelectTarget={handleSelectTarget}
							onSelectGhost={handleSelectGhost}
							onSelectConnection={handleSelectConnection}
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
</style>
