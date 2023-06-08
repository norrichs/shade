<script lang="ts">
	import { config0 } from '$lib/stores';
	import {initTabStyle} from "$lib/shades-config"
	import type { TabStyle } from '$lib/generate-shape';

	export let showControl: string;

	let rotZ: number = ($config0.levelConfig.levelOffset.rotZ * 180) / Math.PI;
	let rotX: number = ($config0.levelConfig.levelOffset.rotX * 180) / Math.PI;
	let rotY: number = ($config0.levelConfig.levelOffset.rotY * 180) / Math.PI;

	let tabStyle: TabStyle = window.structuredClone($config0.bandConfig.tabStyle);

	$: {
		$config0.levelConfig.levelOffset.rotZ = (rotZ * Math.PI) / 180;
		$config0.levelConfig.levelOffset.rotX = (rotX * Math.PI) / 180;
		$config0.levelConfig.levelOffset.rotY = (rotY * Math.PI) / 180;
	}

	$: {
		$config0.bandConfig.tabStyle =
			$config0.bandConfig.tabStyle.style !== tabStyle.style
				? initTabStyle(tabStyle.style)
				: window.structuredClone(tabStyle);
		tabStyle = window.structuredClone($config0.bandConfig.tabStyle);
	}
</script>

{#if showControl === 'Struts'}

	<section class="control-group">
		<div>Struts</div>
		<div />
		<label for="render-struts">Show</label>
		<input id="render-struts" type="checkbox" bind:checked={$config0.renderConfig.show.struts} />
		<label for="strut-tiling">Tiling</label>
		<select id="strut-tiling" bind:value={$config0.strutConfig.tiling}>
			<option>helical-right</option>
			<option disabled>helical-left</option>
			<option disabled>circumference</option>
			<option disabled>triangular</option>
			<option disabled>hexagonal</option>
		</select>
		<label for="strut-width">Width</label>
		<input id="strut-width" type="number" min="0" bind:value={$config0.strutConfig.width} />
		<label for="strut-orientation">Orientation</label>
		<select id="strut-orientation" bind:value={$config0.strutConfig.orientation}>
			<option>inside</option>
			<option>outside</option>
			<option>half</option>
		</select>
		<label for="radiate">Radiate Style</label>
		<select id="radiate" bind:value={$config0.strutConfig.radiate}>
			<option>level</option>
			<option>orthogonal</option>
			<option>hybrid</option>
		</select>
	</section>

{:else if showControl === '3D'}

	<section>
		{#if $config0.renderConfig.ranges?.rangeStyle === 'slice'}
			<section class="control-group">
				{#each Object.keys($config0.renderConfig.ranges).filter((key) => key !== 'rangeStyle') as rangeKey}
					<label for={rangeKey}>{rangeKey}</label>
					<input id={rangeKey} type="number" bind:value={$config0.renderConfig.ranges[rangeKey]} />
				{/each}

				{#if $config0.renderConfig.show}
					<div style="grid-column: 1 / 3; font-size: 20px;">Show</div>
					{#each Object.keys($config0.renderConfig.show) as key}
						<label for={`show-${key}`}>{key}</label>
						<input
							id={`show-${key}`}
							type="checkbox"
							bind:checked={$config0.renderConfig.show[key]}
						/>
					{/each}
				{/if}
			</section>
		{/if}
		<section class="control-group">
			<label for="band-style">Band Style</label>
			<select id="band-style" bind:value={$config0.bandConfig.bandStyle}>
				<option>circumference</option>
				<option>helical-right</option>
				<option>helical-left</option>
			</select>
			<label for="tab-style">Tab Style</label>
			<select id="tab-style" bind:value={tabStyle.style} on:change={() => $config0.renderConfig.show.tabs = true}>
				<option>full</option>
				<option>trapezoid</option>
				<option>multi-facet-full</option>
				<option disabled>multi-facet-trap</option>
			</select>
			<label for="tab-direction">Tab Direction</label>
			<select id="tab-direction" bind:value={tabStyle.direction} on:change={() => $config0.renderConfig.show.tabs = true}>
				<option>greater</option>
				<option>lesser</option>
				<option>both</option>
			</select>
			{#if tabStyle?.style === 'trapezoid' && tabStyle?.width?.value !== undefined}
				<label for="tab-width">Tab Width</label>
				<input id="tab-width" type="number" min="1" bind:value={tabStyle.width.value} on:change={() => $config0.renderConfig.show.tabs = true}/>
			{/if}
		</section>
	</section>

{:else if showControl === 'Levels'}
	<section class="control-group">
		{#if $config0.levelConfig}
			<label for="by-divisions">Divisions</label>
			<select
				id="by-divisions"
				bind:value={$config0.levelConfig.levelPrototypeSampleMethod.byDivisions}
			>
				<option>whole</option>
				<option>offsetHalf</option>
			</select>
			<label for="divide-per">Per</label>
			<select
				id="divide-per"
				bind:value={$config0.levelConfig.levelPrototypeSampleMethod.dividePer}
			>
				<option>shape</option>
				<option>curve</option>
			</select>

			<label for="zCurve-sample-method">Z Curve Sample</label>
			<select id="zCurve-sample-method" bind:value={$config0.levelConfig.zCurveSampleMethod}>
				<!-- <option value="levelInterval">By Level</option> -->
				<option value={{ method: 'divideCurvePath', divisions: 10 }}>By Whole Curve</option>
				<option value={{ method: 'divideCurve', divisions: 3 }}>By Sub-curve</option>
			</select>
			{#if typeof $config0.levelConfig.zCurveSampleMethod === 'object' && Object.hasOwn($config0.levelConfig.zCurveSampleMethod, 'method')}
				<label for="zCurve-divisions">Divisions</label>
				<input
					id="zCurve-divisions"
					type="number"
					min="1"
					bind:value={$config0.levelConfig.zCurveSampleMethod.divisions}
				/>
			{/if}

			<label for="x_offset">X</label>
			<input id="x_offset" type="number" bind:value={$config0.levelConfig.levelOffset.x} />
			<label for="y_offset">Y</label>
			<input id="y_offset" type="number" bind:value={$config0.levelConfig.levelOffset.y} />
			<label for="z_offset">Z</label>
			<input id="z_offset" type="number" bind:value={$config0.levelConfig.levelOffset.z} />
			<label for="rotx_offset">rotion X</label>
			<input id="rotx_offset" type="number" min={-360} max={360} bind:value={rotX} />
			<label for="roty_offset">rotation Y</label>
			<input id="roty_offset" type="number" min={-360} max={360} bind:value={rotY} />
			<label for="rotz_offset">rotation Z</label>
			<input id="rotz_offset" type="number" min={-360} max={360} step={0.05} bind:value={rotZ} />
		{/if}
	</section>

{:else if showControl === 'Cut'}
	<section>
		<h4>Cut Pattern</h4>
		<div class="control-group">
			{#each Object.entries($config0.patternConfig.showPattern) as show}
				<label for={`show-${show[0]}`}>{show[0]}</label>
				<select id={`show-${show[0]}`} bind:value={$config0.patternConfig.showPattern[show[0]]}>
					<option>faceted</option>
					<option>outlined</option>
					<option>none</option>
				</select>
			{/each}
		</div>
		<h4>Cutouts</h4>
		<div class="readout">
			{#if $config0.cutoutConfig}
				<span>{$config0.cutoutConfig.tilePattern.type}</span>
				{#if $config0.cutoutConfig.tilePattern.type === "alternating-band"}
				<span> - nthBand: {$config0.cutoutConfig.tilePattern.nthBand}</span>
				{/if}

				<div>{$config0.cutoutConfig.holeConfigs[0][0].type}</div>
				{#if $config0.cutoutConfig.holeConfigs[0][0].type === "HoleConfigBand"}
					<div>Locate</div>
					{#each Object.keys($config0.cutoutConfig.holeConfigs[0][0].locate) as key}
						<div style="padding-left: 0.5em;">
							<label for={`locate-${key}`}>{key}: </label>
							{#if typeof $config0.cutoutConfig.holeConfigs[0][0].locate[key] === "number"}
								<input id={`locate-${key}`} type="number" bind:value={$config0.cutoutConfig.holeConfigs[0][0].locate[key]}/>
							{:else}
								<span id={`locate-${key}`}>{$config0.cutoutConfig.holeConfigs[0][0].locate[key]}</span>
							{/if}
						</div>
					{/each}
					<div>Geometry</div>
					{#each Object.keys($config0.cutoutConfig.holeConfigs[0][0].geometry[0]) as key}
						<div style="padding-left: 0.5em;">
							<label for={`geometry-${key}`}>{key}: </label>
							{#if typeof $config0.cutoutConfig.holeConfigs[0][0].geometry[0][key] === "number"}
								<input id={`geometry-${key}`} type="number" bind:value={$config0.cutoutConfig.holeConfigs[0][0].geometry[0][key]}/>
							{:else}
								<span>{$config0.cutoutConfig.holeConfigs[0][0].geometry[0][key]}</span>
							{/if}
						</div>
					{/each}
				{/if}
			{/if}
		</div>
		<div class="control-group">
			<label for="checkbox-apply-cutout">
				Apply Cutout?
			</label>
			<input type="checkbox" id="checkbox-apply-cutout" />
		</div>
	</section>
{/if}

<style>
	.control-group {
		margin: 4px;
		background-color: #ebe1e1;
		border-radius: 5px;
		padding: 10px;
		width: 400px;
		display: grid;
		grid-template-columns: 1fr 2fr;
	}
	.control-group input {
		width: 40px;
	}
	.control-group select {
		width: 120px;
	}
	.readout {
		margin: 0.5em;
		padding: 0.5em;
		border: 1px solid black;
		border-radius: 8px;
		background-color: aliceblue;
		font-family:'Courier New', Courier, monospace;
		font-size: 0.75em;
	}
</style>
