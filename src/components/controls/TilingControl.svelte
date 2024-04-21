<script lang="ts">
	import CombinedNumberInput from './CombinedNumberInput.svelte';
	import CheckboxInput from './CheckboxInput.svelte';
	import SelectInput from './SelectInput.svelte';
	import { config0 } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import type { TiledPatternConfig } from '$lib/cut-pattern/cut-pattern.types';

	const getTilingOptions = (configs: { [key: string]: TiledPatternConfig }) => {
		console.debug('getTilingOptions', Object.values(configs));
		return Object.values(configs).map((cfg) => {
			return Object.fromEntries([[cfg.type, cfg]]);
		});
	};
</script>

<section>
	<h4>Tiling</h4>
	<ControlGroup>
		<SelectInput
			label="Tiling Pattern"
			bind:value={$config0.tiledPatternConfig}
			options={getTilingOptions(tiledPatternConfigs)}
		/>
	</ControlGroup>
	<ControlGroup>
		<div><span>Type: </span><span>{$config0.tiledPatternConfig.type}</span></div>
		<div>
			{#each $config0.tiledPatternConfig.config as cfg, i}
				{#if cfg.valueType === 'number'}
					<CombinedNumberInput
						label={cfg.type}
						bind:value={cfg.value}
						min={cfg.min}
						max={cfg.max}
						step={cfg.step}
					/>
				{:else if cfg.valueType === 'boolean'}
					<CheckboxInput label={cfg.type} bind:value={cfg.value} />
				{:else if cfg.valueType === 'named'}
					<SelectInput label={cfg.type} bind:value={cfg.value} options={cfg.options} />
				{/if}
			{/each}
		</div>
	</ControlGroup>
</section>

<style>
</style>
