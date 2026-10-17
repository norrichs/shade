<script lang="ts">
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import { patternConfigStore } from '#lib/stores/index.js';
	import { get } from 'svelte/store';
	import LabeledControl from './LabeledControl.svelte';
	import { isTiledPatternConfig, type ScaleUnit } from '#lib/types.js';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';

	const handleChangeUnit = (event: Event) => {
		const target = event.target as HTMLSelectElement;
		const config = get(patternConfigStore);
		const patternTypeConfig = config.patternTypeConfig;
		// Scale only exists on tiled patterns; the controls are hidden otherwise.
		if (!isTiledPatternConfig(patternTypeConfig)) return;
		const inner = patternTypeConfig.config;
		patternConfigStore.set({
			...config,
			patternTypeConfig: {
				...patternTypeConfig,
				config: {
					...inner,
					scaleConfig: { ...inner.scaleConfig, unit: target.value as ScaleUnit }
				}
			}
		});
	};

	const handleChangeQuantity = (newValue: number) => {
		const config = get(patternConfigStore);
		const patternTypeConfig = config.patternTypeConfig;
		// Scale only exists on tiled patterns; the controls are hidden otherwise.
		if (!isTiledPatternConfig(patternTypeConfig)) return;
		const inner = patternTypeConfig.config;
		patternConfigStore.set({
			...config,
			patternTypeConfig: {
				...patternTypeConfig,
				config: {
					...inner,
					scaleConfig: { ...inner.scaleConfig, quantity: newValue }
				}
			}
		});
	};
</script>

<Editor>
	<section>
		<header>Pattern Scale</header>
		{#if isTiledPatternConfig($patternConfigStore.patternTypeConfig)}
			{@const scaleConfig = $patternConfigStore.patternTypeConfig.config.scaleConfig}
			<Container direction="column">
				<LabeledControl label="Unit">
					<select onchange={handleChangeUnit} value={scaleConfig.unit}>
						<option value="mm">mm</option>
						<option value="cm">cm</option>
						<option value="in">in</option>
					</select>
				</LabeledControl>
				<LabeledControl label="Quantity">
					<NumberInput hasButtons onChange={handleChangeQuantity} value={scaleConfig.quantity} />
				</LabeledControl>
			</Container>
		{/if}
	</section>
</Editor>
