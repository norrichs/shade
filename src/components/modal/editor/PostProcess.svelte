<script lang="ts">
	import { patternConfigStore } from '$lib/stores';
	import {
		DEFAULT_POST_PROCESS,
		defaultDropCurve,
		type HoleDropConfig,
		type HoleDropMode
	} from '$lib/cut-pattern/hole-drop-config';
	import type { BezierConfig } from '$lib/types';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import PathEditor from './PathEditor.svelte';
	import { allPointsInUnitSquare } from './path-editor';

	// Shallow copy, as PageLayout.svelte does: reading the stored object itself
	// would hand `$derived` the same reference on every run, so in-place edits
	// would never propagate to the readouts below.
	let postProcess = $derived({
		...($patternConfigStore.patternConfig.postProcess ?? DEFAULT_POST_PROCESS)
	});
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
	const write = (nextDropHoles: HoleDropConfig, runSeed = postProcess.runSeed) => {
		$patternConfigStore.patternConfig.postProcess = {
			...postProcess,
			dropHoles: nextDropHoles,
			runSeed
		};
	};

	const setFlag = (flag: 'dropOutline' | 'dropLabelText', value: boolean) => {
		$patternConfigStore.patternConfig.postProcess = { ...postProcess, [flag]: value };
	};

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
	</Container>
</Editor>

<style>
	.hint {
		font-size: 0.8em;
		opacity: 0.7;
		margin: 0;
	}
</style>
