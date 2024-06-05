<script lang="ts">
	import { getModelHeight } from '$lib/cut-pattern/cut-pattern';
	import { bandPattern, config0, shapeData } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';

	let applyCutout = false;
</script>

<section>
	<h4>Cut Pattern</h4>
	<ControlGroup>
		{#each Object.entries($config0.patternConfig.showPattern) as show}
			<label for={`show-${show[0]}`}>{show[0]}</label>
			<select id={`show-${show[0]}`} bind:value={$config0.patternConfig.showPattern[show[0]]}>
				<option>layered</option>
				<option>faceted</option>
				<option>outlined</option>
				<option>patterned</option>
				<option>none</option>
			</select>
		{/each}
	</ControlGroup>
	<ControlGroup show={applyCutout}>
		<h4>Cutouts</h4>
		<div class="readout">
			{#if $config0.cutoutConfig}
				<span>{$config0.cutoutConfig.tilePattern.type}</span>
				{#if $config0.cutoutConfig.tilePattern.type === 'alternating-band'}
					<span> - nthBand: {$config0.cutoutConfig.tilePattern.nthBand}</span>
				{/if}

				<div>{$config0.cutoutConfig.holeConfigs[0][0].type}</div>
				{#if $config0.cutoutConfig.holeConfigs[0][0].type === 'HoleConfigBand'}
					<div>Locate</div>
					{#each Object.keys($config0.cutoutConfig.holeConfigs[0][0].locate) as key}
						<div style="padding-left: 0.5em;">
							<label for={`locate-${key}`}>{key}: </label>
							{#if typeof $config0.cutoutConfig.holeConfigs[0][0].locate[key] === 'number'}
								<input
									id={`locate-${key}`}
									type="number"
									bind:value={$config0.cutoutConfig.holeConfigs[0][0].locate[key]}
								/>
							{:else}
								<span id={`locate-${key}`}
									>{$config0.cutoutConfig.holeConfigs[0][0].locate[key]}</span
								>
							{/if}
						</div>
					{/each}
					<div>Geometry</div>
					{#each Object.keys($config0.cutoutConfig.holeConfigs[0][0].geometry[0]) as key}
						<div style="padding-left: 0.5em;">
							<label for={`geometry-${key}`}>{key}: </label>
							{#if typeof $config0.cutoutConfig.holeConfigs[0][0].geometry[0][key] === 'number'}
								<input
									id={`geometry-${key}`}
									type="number"
									bind:value={$config0.cutoutConfig.holeConfigs[0][0].geometry[0][key]}
								/>
							{:else}
								<span>{$config0.cutoutConfig.holeConfigs[0][0].geometry[0][key]}</span>
							{/if}
						</div>
					{/each}
				{/if}
			{/if}
		</div>
	</ControlGroup>
	<ControlGroup>
		<label for="checkbox-apply-cutout"> Apply Cutout? </label>
		<input type="checkbox" id="checkbox-apply-cutout" bind:checked={applyCutout} />
	</ControlGroup>
	<h4>Scale</h4>
	<ControlGroup>
		<div>Model Height:</div>
		<div>{Math.round($shapeData.height * 10) / 10}</div>
		<div>Pattern Length:</div>
		<div>{$bandPattern.meta?.maxLength ? Math.round($bandPattern.meta?.maxLength) : 0}</div>
	</ControlGroup>
</section>
