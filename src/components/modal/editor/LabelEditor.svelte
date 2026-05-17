<script lang="ts">
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import { patternConfigStore } from '$lib/stores';
	import { get } from 'svelte/store';
	import { isOutlinedPatternConfig } from '$lib/types';
	import type { PatternLabelsConfig } from '$lib/types';

	type OnTab = NonNullable<PatternLabelsConfig['onTab']>;
	type SelfTag = NonNullable<PatternLabelsConfig['selfTag']>;

	const defaultLabels = (): PatternLabelsConfig => ({
		onTab: { enabled: false, padding: 0.1 },
		selfTag: { enabled: true, scale: 0.1, angle: Math.PI, padding: 10 }
	});

	const defaultOnTab = (): OnTab => ({ enabled: false, padding: 0.1 });
	const defaultSelfTag = (): SelfTag => ({
		enabled: true,
		scale: 0.1,
		angle: Math.PI,
		padding: 10
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
		config.patternTypeConfig.labels = next;
		patternConfigStore.set(config);
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

	const handleSelfTagScale = (newValue: number) => {
		writeLabels({
			...labels,
			selfTag: { ...(labels.selfTag ?? defaultSelfTag()), scale: newValue }
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
					<input
						type="checkbox"
						checked={onTab.enabled}
						onchange={handleOnTabEnabled}
					/>
				</LabeledControl>
				<LabeledControl label="Padding">
					<NumberInput
						hasButtons
						min={0}
						max={0.5}
						step={0.01}
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
				<input
					type="checkbox"
					checked={selfTag.enabled}
					onchange={handleSelfTagEnabled}
				/>
			</LabeledControl>
			<LabeledControl label="Scale">
				<NumberInput
					hasButtons
					min={-2}
					max={2}
					step={0.1}
					value={selfTag.scale}
					onChange={handleSelfTagScale}
				/>
			</LabeledControl>
			<LabeledControl label="Padding">
				<NumberInput
					hasButtons
					min={0}
					max={50}
					step={1}
					value={selfTag.padding ?? 10}
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
