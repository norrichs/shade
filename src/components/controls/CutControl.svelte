<script lang="ts">
	import { getModelHeight } from '$lib/cut-pattern/cut-pattern';
	import { patternConfigStore } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';

	let applyCutout = false;
</script>

<section>
	<h4>Cut Pattern</h4>
	<ControlGroup>
		{#each Object.entries($patternConfigStore.patternConfig.showPattern) as show}
			<label for={`show-${show[0]}`}>{show[0]}</label>
			<select
				id={`show-${show[0]}`}
				bind:value={$patternConfigStore.patternConfig.showPattern[show[0]]}
			>
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
			{#if $patternConfigStore.cutoutConfig}
				<span>{$patternConfigStore.cutoutConfig.tilePattern.type}</span>
				{#if $patternConfigStore.cutoutConfig.tilePattern.type === 'alternating-band'}
					<span> - nthBand: {$patternConfigStore.cutoutConfig.tilePattern.nthBand}</span>
				{/if}

				<div>{$patternConfigStore.cutoutConfig.holeConfigs[0][0].type}</div>
				{#if $patternConfigStore.cutoutConfig.holeConfigs[0][0].type === 'HoleConfigBand'}
					<div>Locate</div>
					{#each Object.keys($patternConfigStore.cutoutConfig.holeConfigs[0][0].locate) as key}
						<div style="padding-left: 0.5em;">
							<label for={`locate-${key}`}>{key}: </label>
							{#if typeof $patternConfigStore.cutoutConfig.holeConfigs[0][0].locate[key] === 'number'}
								<input
									id={`locate-${key}`}
									type="number"
									bind:value={$patternConfigStore.cutoutConfig.holeConfigs[0][0].locate[key]}
								/>
							{:else}
								<span id={`locate-${key}`}
									>{$patternConfigStore.cutoutConfig.holeConfigs[0][0].locate[key]}</span
								>
							{/if}
						</div>
					{/each}
					<div>Geometry</div>
					{#each Object.keys($patternConfigStore.cutoutConfig.holeConfigs[0][0].geometry[0]) as key}
						<div style="padding-left: 0.5em;">
							<label for={`geometry-${key}`}>{key}: </label>
							{#if typeof $patternConfigStore.cutoutConfig.holeConfigs[0][0].geometry[0][key] === 'number'}
								<input
									id={`geometry-${key}`}
									type="number"
									bind:value={$patternConfigStore.cutoutConfig.holeConfigs[0][0].geometry[0][key]}
								/>
							{:else}
								<span>{$patternConfigStore.cutoutConfig.holeConfigs[0][0].geometry[0][key]}</span>
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
		<!-- <div>{Math.round($globuleStore.height * 10) / 10}</div> -->
		<div>Pattern Length:</div>
		<!-- <div>{$bandPattern.meta?.maxLength ? Math.round($bandPattern.meta?.maxLength) : 0}</div> -->
	</ControlGroup>
</section>
