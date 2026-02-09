<script lang="ts">
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import { patternConfigStore } from '$lib/stores';
	import { get } from 'svelte/store';
	import LabeledControl from './LabeledControl.svelte';
	import type { ScaleUnit } from '$lib/types';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';

	const handleChangeUnit = (event: Event) => {
		const target = event.target as HTMLSelectElement;
		const config = get(patternConfigStore);
		config.tiledPatternConfig.config.scaleConfig.unit = target.value as ScaleUnit;
		patternConfigStore.set(config);
	};

	const handleChangeQuantity = (newValue: number) => {
		const config = get(patternConfigStore);
		config.tiledPatternConfig.config.scaleConfig.quantity = newValue;
		patternConfigStore.set(config);
	};
</script>

<Editor>
	<section>
		<header>Pattern Scale</header>
		<Container direction="column">
			<LabeledControl label="Unit">
				<select
					onchange={handleChangeUnit}
					value={$patternConfigStore.tiledPatternConfig.config.scaleConfig.unit}
				>
					<option value="mm">mm</option>
					<option value="cm">cm</option>
					<option value="in">in</option>
				</select>
			</LabeledControl>
			<LabeledControl label="Quantity">
				<NumberInput
					hasButtons
					onChange={handleChangeQuantity}
					value={$patternConfigStore.tiledPatternConfig.config.scaleConfig.quantity}
				/>
			</LabeledControl>
		</Container>
	</section>
</Editor>
