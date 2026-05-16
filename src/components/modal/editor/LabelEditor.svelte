<script lang="ts">
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import { patternConfigStore } from '$lib/stores';
	import { get } from 'svelte/store';
	import { isOutlinedPatternConfig } from '$lib/types';
	import type { PatternLabelsConfig } from '$lib/types';

	type ExternalTag = NonNullable<PatternLabelsConfig['externalTag']>;
	type OnTab = NonNullable<PatternLabelsConfig['onTab']>;

	const defaultLabels = (): PatternLabelsConfig => ({
		externalTag: { enabled: true, scale: 0.1, angle: Math.PI },
		onTab: { enabled: false, padding: 0.1 }
	});

	const defaultExternalTag = (): ExternalTag => ({ enabled: true, scale: 0.1, angle: Math.PI });
	const defaultOnTab = (): OnTab => ({ enabled: false, padding: 0.1 });

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
	let externalTag = $derived(labels.externalTag ?? defaultExternalTag());
	let onTab = $derived(labels.onTab ?? defaultOnTab());

	const writeLabels = (next: PatternLabelsConfig) => {
		const config = get(patternConfigStore);
		config.patternTypeConfig.labels = next;
		patternConfigStore.set(config);
	};

	const handleExternalEnabled = (event: Event) => {
		const checked = (event.target as HTMLInputElement).checked;
		writeLabels({
			...labels,
			externalTag: { ...(labels.externalTag ?? defaultExternalTag()), enabled: checked }
		});
	};

	const handleExternalScale = (newValue: number) => {
		writeLabels({
			...labels,
			externalTag: { ...(labels.externalTag ?? defaultExternalTag()), scale: newValue }
		});
	};

	// Angle stored & edited in radians to match TiledPatternConfig.labels.externalTag.angle.
	const handleExternalAngle = (newValue: number) => {
		writeLabels({
			...labels,
			externalTag: { ...(labels.externalTag ?? defaultExternalTag()), angle: newValue }
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
</script>

<Editor>
	<section>
		<header>External Tag</header>
		<Container direction="column">
			<LabeledControl label="Enabled">
				<input
					type="checkbox"
					checked={externalTag.enabled}
					onchange={handleExternalEnabled}
				/>
			</LabeledControl>
			<LabeledControl label="Scale">
				<NumberInput
					hasButtons
					min={-2}
					max={2}
					step={0.1}
					value={externalTag.scale}
					onChange={handleExternalScale}
				/>
			</LabeledControl>
			<LabeledControl label="Angle (rad)">
				<NumberInput
					hasButtons
					min={-Math.PI * 2}
					max={Math.PI * 2}
					step={0.1}
					value={externalTag.angle}
					onChange={handleExternalAngle}
				/>
			</LabeledControl>
		</Container>
	</section>
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
