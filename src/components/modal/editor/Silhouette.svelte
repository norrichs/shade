<script lang="ts">
	import { get } from 'svelte/store';
	import { selectedBand, superConfigStore } from '$lib/stores';
	import { getCurvePoints } from '$lib/generate-level';
	import type { BezierConfig, CurveSampleMethod, SuperGlobuleConfig } from '$lib/types';
	import { isCurveSampleMethodMethod } from '$lib/types';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import PathEditor, { type PathEditorOverlayContext } from './PathEditor.svelte';
	import { neighborPointMatch } from './path-editor';
	import { fillPathToAxis, mirrorCurvesAcrossY } from './curve-preview';
	import { silhouetteTab, type SilhouetteTab } from './silhouette-editor-store';

	// Derived from the store rather than read once into a `let`, so an externally
	// loaded config (or an edit made from another panel) shows up here.
	let sgIndex = $derived($selectedBand?.s ?? 0);
	let globuleConfig = $derived($superConfigStore.subGlobuleConfigs[sgIndex]?.globuleConfig);
	let silhouetteConfig = $derived(globuleConfig?.silhouetteConfig);
	let depthCurveConfig = $derived(globuleConfig?.depthCurveConfig);
	let levelConfig = $derived(globuleConfig?.levelConfig);

	const RADIANS_PER_DEGREE = Math.PI / 180;

	type GlobuleConfigOf = SuperGlobuleConfig['subGlobuleConfigs'][number]['globuleConfig'];

	/**
	 * Replace the globule config, rebuilding every object reference on the path
	 * down to it.
	 *
	 * The rest of the app mutates the config in place and re-sets the same object,
	 * which works only because `writable.set` notifies unconditionally. That is not
	 * enough here: this panel reads through a `$derived` chain, and `$derived`
	 * stops propagating when a step returns the reference it returned last time —
	 * so an in-place edit updated the store but left the overlay and the inputs
	 * showing stale values until the floater was closed and reopened.
	 */
	const updateGlobule = (mutate: (globule: GlobuleConfigOf) => GlobuleConfigOf) => {
		const config = get(superConfigStore);
		const subGlobule = config.subGlobuleConfigs[sgIndex];
		if (!subGlobule) return;
		config.subGlobuleConfigs = config.subGlobuleConfigs.map((sub, index) =>
			index === sgIndex ? { ...sub, globuleConfig: mutate(sub.globuleConfig) } : sub
		);
		superConfigStore.set(config);
	};

	const updateLevelConfig = (
		mutate: (level: GlobuleConfigOf['levelConfig']) => GlobuleConfigOf['levelConfig']
	) => updateGlobule((globule) => ({ ...globule, levelConfig: mutate(globule.levelConfig) }));

	const updateFirstOffset = (patch: Record<string, number>) =>
		updateLevelConfig((level) => ({
			...level,
			levelOffsets: level.levelOffsets.map((offset, index) =>
				index === 0 ? { ...offset, ...patch } : offset
			)
		}));

	const setSilhouetteCurves = (curves: BezierConfig[]) =>
		updateGlobule((globule) => ({
			...globule,
			silhouetteConfig: { ...globule.silhouetteConfig, curves }
		}));

	const setDepthCurves = (curves: BezierConfig[]) =>
		updateGlobule((globule) => ({
			...globule,
			depthCurveConfig: { ...globule.depthCurveConfig, curves }
		}));

	const setDepthBaseline = (value: number) =>
		updateGlobule((globule) => ({
			...globule,
			depthCurveConfig: { ...globule.depthCurveConfig, depthCurveBaseline: value }
		}));

	const setLevelCount = (value: number) =>
		updateLevelConfig((level) => ({ ...level, levelCount: value }));

	const setSampleMethod = (event: Event) => {
		const value = (event.target as HTMLSelectElement).value;
		if (!isCurveSampleMethodMethod(value)) return;
		updateLevelConfig((level) => ({
			...level,
			silhouetteSampleMethod: {
				...level.silhouetteSampleMethod,
				method: value
			} as CurveSampleMethod
		}));
	};

	const setDivisions = (value: number) =>
		updateLevelConfig((level) => ({
			...level,
			silhouetteSampleMethod: {
				...level.silhouetteSampleMethod,
				divisions: value
			} as CurveSampleMethod
		}));

	const setOffset = (axis: 'x' | 'y' | 'z', value: number) => updateFirstOffset({ [axis]: value });

	// Stored in radians, edited in degrees. The legacy panel wrote only rotZ and
	// silently dropped rotX and rotY.
	const setRotation = (axis: 'rotX' | 'rotY' | 'rotZ', degrees: number) =>
		updateFirstOffset({ [axis]: degrees * RADIANS_PER_DEGREE });

	const toDegrees = (radians: number | undefined) =>
		Math.round(((radians ?? 0) / RADIANS_PER_DEGREE) * 1000) / 1000;

	const editorConfig = {
		gutter: 300,
		padding: 100,
		contentBounds: { top: -100, left: -100, width: 200, height: 200 },
		size: { width: 300, height: 300 }
	};

	const tabs: { id: SilhouetteTab; label: string }[] = [
		{ id: 'silhouette', label: 'Silhouette' },
		{ id: 'depth', label: 'Depth' }
	];

	/** Sampled level positions along the curve, in the editor's display space. */
	const sampledPoints = (canv: PathEditorOverlayContext['canv']) => {
		if (!silhouetteConfig || !levelConfig) return [];
		const flipAxis = canv.viewBoxData.top + canv.viewBoxData.height / 2;
		try {
			// Vector2s from three; mapped to plain objects here so none reaches a rune.
			return getCurvePoints(silhouetteConfig, levelConfig.silhouetteSampleMethod).points.map(
				(point) => ({ x: point.x, y: 2 * flipAxis - point.y })
			);
		} catch {
			return [];
		}
	};
</script>

<Editor>
	<section>
		<header>Silhouette</header>
		<div class="tabs">
			{#each tabs as tab (tab.id)}
				<button class:active={$silhouetteTab === tab.id} onclick={() => silhouetteTab.set(tab.id)}>
					{tab.label}
				</button>
			{/each}
		</div>

		<Container direction="row">
			<Container direction="column">
				{#if $silhouetteTab === 'silhouette' && silhouetteConfig}
					{#snippet silhouetteOverlay({ curveDef, canv }: PathEditorOverlayContext)}
						<path d={fillPathToAxis(curveDef)} fill="rgba(255,0,0,0.35)" stroke="none" />
						<path
							d={fillPathToAxis(mirrorCurvesAcrossY(curveDef))}
							fill="rgba(255,0,0,0.35)"
							stroke="none"
						/>
						{#each sampledPoints(canv) as point}
							<circle cx={point.x} cy={point.y} r={2 * canv.scale} fill="rgba(0,0,0,0.5)" />
						{/each}
					{/snippet}
					<PathEditor
						flipY
						curveDef={silhouetteConfig.curves}
						onChangeCurveDef={setSilhouetteCurves}
						config={editorConfig}
						limits={[neighborPointMatch]}
						coupling="full"
						enablePointTypeToggle
						showCurveTools
						showPointInputsToggle
						editorId="silhouette"
						overlay={silhouetteOverlay}
					>
						<line x1="0" y1="-100" x2="0" y2="100" stroke="black" stroke-width="0.25" />
					</PathEditor>
				{:else if $silhouetteTab === 'depth' && depthCurveConfig}
					<PathEditor
						flipY
						curveDef={depthCurveConfig.curves}
						onChangeCurveDef={setDepthCurves}
						config={editorConfig}
						limits={[neighborPointMatch]}
						coupling="full"
						enablePointTypeToggle
						showCurveTools
						showPointInputsToggle
						editorId="depth"
					>
						<line x1="0" y1="-100" x2="0" y2="100" stroke="black" stroke-width="0.25" />
						<!-- x = baseline means depth 1: the level's own cross-section, unmodified -->
						<line
							x1={depthCurveConfig.depthCurveBaseline}
							y1="-100"
							x2={depthCurveConfig.depthCurveBaseline}
							y2="100"
							stroke="rgba(0,0,200,0.5)"
							stroke-width="0.5"
							stroke-dasharray="4 4"
						/>
					</PathEditor>
				{/if}
			</Container>

			<Container direction="column">
				{#if $silhouetteTab === 'depth' && depthCurveConfig}
					<LabeledControl label="Baseline">
						<NumberInput
							value={depthCurveConfig.depthCurveBaseline}
							onChange={setDepthBaseline}
							hasButtons
						/>
					</LabeledControl>
				{/if}
				{#if levelConfig}
					<LabeledControl label="Levels">
						{#if levelConfig.levelCount !== undefined}
							<NumberInput value={levelConfig.levelCount} onChange={setLevelCount} hasButtons />
						{/if}
					</LabeledControl>
					<LabeledControl label="Sampling">
						<select value={levelConfig.silhouetteSampleMethod.method} onchange={setSampleMethod}>
							<option value="divideCurvePath">By Whole Curve</option>
							<option value="divideCurve">By Sub-curve</option>
							<option value="preserveAspectRatio">Preserve Aspect Ratio</option>
						</select>
					</LabeledControl>
					<LabeledControl label="Divisions">
						<NumberInput
							value={levelConfig.silhouetteSampleMethod.divisions}
							onChange={setDivisions}
							min={1}
							hasButtons
						/>
					</LabeledControl>

					{#if levelConfig.levelOffsets[0]}
						<header class="group">Level offset</header>
						{#each ['x', 'y', 'z'] as const as axis}
							<LabeledControl label={axis.toUpperCase()}>
								<NumberInput
									value={levelConfig.levelOffsets[0][axis]}
									onChange={(value) => setOffset(axis, value)}
									hasButtons
								/>
							</LabeledControl>
						{/each}
						{#each [['rotX', 'Rotate X'], ['rotY', 'Rotate Y'], ['rotZ', 'Rotate Z']] as const as [axis, label]}
							<LabeledControl {label}>
								<NumberInput
									value={toDegrees(levelConfig.levelOffsets[0][axis])}
									onChange={(value) => setRotation(axis, value)}
									min={-360}
									max={360}
									hasButtons
								/>
							</LabeledControl>
						{/each}
					{/if}
				{/if}
			</Container>
		</Container>
	</section>
</Editor>

<style>
	.tabs {
		display: flex;
		flex-direction: row;
		gap: 4px;
		padding: 4px;
	}
	.tabs button.active {
		font-weight: bold;
		text-decoration: underline;
	}
	header.group {
		background-color: rgba(0, 0, 0, 0.06);
		padding: 2px 4px;
		font-size: 0.85em;
		margin-top: 6px;
	}
</style>
