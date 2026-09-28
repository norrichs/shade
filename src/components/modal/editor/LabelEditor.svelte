<script lang="ts">
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import { patternConfigStore } from '$lib/stores';
	import { get } from 'svelte/store';
	import { isOutlinedPatternConfig } from '$lib/types';
	import type { PatternLabelsConfig } from '$lib/types';
	import { LABEL_MM_DEFAULTS } from '$lib/cut-pattern/label-units';

	type OnTab = NonNullable<PatternLabelsConfig['onTab']>;
	type SelfTag = NonNullable<PatternLabelsConfig['selfTag']>;

	// All lengths are mm; they are resolved to pattern units via the page scale.
	const defaultOnTab = (): OnTab => ({ enabled: false, padding: LABEL_MM_DEFAULTS.onTabPadding });
	const defaultSelfTag = (): SelfTag => ({
		enabled: true,
		externalTag: true,
		height: LABEL_MM_DEFAULTS.height,
		angle: 0,
		padding: LABEL_MM_DEFAULTS.padding,
		stemLength: LABEL_MM_DEFAULTS.stemLength,
		stemWidth: LABEL_MM_DEFAULTS.stemWidth
	});
	const defaultLabels = (): PatternLabelsConfig => ({
		units: 'mm',
		onTab: defaultOnTab(),
		selfTag: defaultSelfTag()
	});

	let patternTypeConfig = $derived($patternConfigStore.patternTypeConfig);
	let isOutlined = $derived(isOutlinedPatternConfig(patternTypeConfig));
	// TODO: also gate on whether tabs are actually present
	// (OutlinedTabConfig has no 'none' shape currently; presence of tabConfig is the cue).
	let hasTabs = $derived(
		isOutlined &&
			isOutlinedPatternConfig(patternTypeConfig) &&
			patternTypeConfig.tabConfig !== undefined
	);
	let onTabAvailable = $derived(isOutlined && hasTabs);

	let labels = $derived(patternTypeConfig.labels ?? defaultLabels());
	let onTab = $derived(labels.onTab ?? defaultOnTab());
	let selfTag = $derived(labels.selfTag ?? defaultSelfTag());

	const writeLabels = (next: PatternLabelsConfig) => {
		const config = get(patternConfigStore);
		patternConfigStore.set({
			...config,
			patternTypeConfig: {
				...config.patternTypeConfig,
				labels: { ...next, units: 'mm' }
			}
		});
	};

	const handleOnTabEnabled = (event: Event) => {
		const checked = (event.target as HTMLInputElement).checked;
		writeLabels({
			...labels,
			onTab: { ...(labels.onTab ?? defaultOnTab()), enabled: checked }
		});
	};

	const handleOnTabPadding = (newValue: number) => {
		writeLabels({
			...labels,
			onTab: { ...(labels.onTab ?? defaultOnTab()), padding: newValue }
		});
	};

	const handleOnTabColor = (event: Event) => {
		const value = (event.target as HTMLInputElement).value;
		writeLabels({
			...labels,
			onTab: { ...(labels.onTab ?? defaultOnTab()), color: value }
		});
	};

	const handleSelfTagEnabled = (event: Event) => {
		const checked = (event.target as HTMLInputElement).checked;
		writeLabels({
			...labels,
			selfTag: { ...(labels.selfTag ?? defaultSelfTag()), enabled: checked }
		});
	};

	const handleSelfTagExternalTag = (event: Event) => {
		const checked = (event.target as HTMLInputElement).checked;
		writeLabels({
			...labels,
			selfTag: { ...(labels.selfTag ?? defaultSelfTag()), externalTag: checked }
		});
	};

	const handleSelfTagHeight = (newValue: number) => {
		writeLabels({
			...labels,
			selfTag: { ...(labels.selfTag ?? defaultSelfTag()), height: newValue }
		});
	};

	// Angle stored & edited in radians to match selfTag.angle.
	const handleSelfTagAngle = (newValue: number) => {
		writeLabels({
			...labels,
			selfTag: { ...(labels.selfTag ?? defaultSelfTag()), angle: newValue }
		});
	};

	const handleSelfTagPadding = (newValue: number) => {
		writeLabels({
			...labels,
			selfTag: { ...(labels.selfTag ?? defaultSelfTag()), padding: newValue }
		});
	};

	const handleSelfTagStemLength = (newValue: number) => {
		writeLabels({
			...labels,
			selfTag: { ...(labels.selfTag ?? defaultSelfTag()), stemLength: newValue }
		});
	};

	const handleSelfTagStemWidth = (newValue: number) => {
		writeLabels({
			...labels,
			selfTag: { ...(labels.selfTag ?? defaultSelfTag()), stemWidth: newValue }
		});
	};
</script>

<Editor>
	<section>
		<header>On Tab</header>
		<Container direction="column">
			{#if !onTabAvailable}
				<div class="note">On-tab labels require an Outlined pattern with tabs.</div>
			{/if}
			<fieldset disabled={!onTabAvailable}>
				<LabeledControl label="Enabled">
					<input type="checkbox" checked={onTab.enabled} onchange={handleOnTabEnabled} />
				</LabeledControl>
				<LabeledControl label="Padding (mm)">
					<NumberInput
						hasButtons
						min={0}
						max={20}
						step={0.1}
						value={onTab.padding}
						onChange={handleOnTabPadding}
					/>
				</LabeledControl>
				<LabeledControl label="Color">
					<input type="color" value={onTab.color ?? '#000000'} onchange={handleOnTabColor} />
				</LabeledControl>
			</fieldset>
		</Container>
	</section>
	<section>
		<header>Self Tag</header>
		<Container direction="column">
			<LabeledControl label="Enabled">
				<input type="checkbox" checked={selfTag.enabled} onchange={handleSelfTagEnabled} />
			</LabeledControl>
			<LabeledControl label="External Tag">
				<input
					type="checkbox"
					checked={selfTag.externalTag ?? false}
					onchange={handleSelfTagExternalTag}
				/>
			</LabeledControl>
			<LabeledControl label="Height (mm)">
				<NumberInput
					hasButtons
					min={1}
					max={200}
					step={0.5}
					value={selfTag.height}
					onChange={handleSelfTagHeight}
				/>
			</LabeledControl>
			<LabeledControl label="Padding (mm)">
				<NumberInput
					hasButtons
					min={0}
					max={50}
					step={0.5}
					value={selfTag.padding ?? LABEL_MM_DEFAULTS.padding}
					onChange={handleSelfTagPadding}
				/>
			</LabeledControl>
			<LabeledControl label="Angle (rad)">
				<NumberInput
					hasButtons
					min={-Math.PI * 2}
					max={Math.PI * 2}
					step={0.1}
					value={selfTag.angle}
					onChange={handleSelfTagAngle}
				/>
			</LabeledControl>
			<LabeledControl label="Stem Length (mm)">
				<NumberInput
					hasButtons
					min={0}
					max={200}
					step={0.5}
					value={selfTag.stemLength ?? LABEL_MM_DEFAULTS.stemLength}
					onChange={handleSelfTagStemLength}
				/>
			</LabeledControl>
			<LabeledControl label="Stem Width (mm)">
				<NumberInput
					hasButtons
					min={0}
					max={200}
					step={0.5}
					value={selfTag.stemWidth ?? LABEL_MM_DEFAULTS.stemWidth}
					onChange={handleSelfTagStemWidth}
				/>
			</LabeledControl>
		</Container>
	</section>
</Editor>

<style>
	.note {
		font-size: 0.85em;
		color: #555;
		padding: 4px 0;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	fieldset[disabled] {
		opacity: 0.5;
	}
</style>
