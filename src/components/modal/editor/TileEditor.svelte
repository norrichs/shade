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
	import type { PathEditorConfig } from './path-editor-shared';

	let draft: TiledPatternSpec | null = $state(null);
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
		draft = structuredClone(found.spec);
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
		const ok = await tilePatternSpecStore.update(storedRowId, draft);
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
		const newSpec: TiledPatternSpec = {
			...draft,
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
		draft = structuredClone(found.spec);
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

	const editorConfig: PathEditorConfig = $derived.by(() => {
		const currentDraft: TiledPatternSpec | null = draft;
		const unitWidth = currentDraft?.unit.width ?? 42;
		const unitHeight = currentDraft?.unit.height ?? 14;
		const padding = 4;
		const contentWidth = unitWidth + 4;
		const contentHeight = unitHeight + 4;
		const viewBoxWidth = contentWidth + padding * 2;
		const viewBoxHeight = contentHeight + padding * 2;
		const sizeWidth = 800;
		const sizeHeight = (sizeWidth * viewBoxHeight) / viewBoxWidth;
		return {
			padding,
			gutter: 0,
			contentBounds: {
				top: -2,
				left: -2,
				width: contentWidth,
				height: contentHeight
			},
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
			{#if draft}
				<div class="viewport-wrap">
					<SegmentPathEditor
						unit={draft.unit}
						config={editorConfig}
						onChangeUnit={handleUnitChange}
					/>
				</div>
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
