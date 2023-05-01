<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { renderConfig, levelConfig, bandConfig, patternConfig, strutConfig, initTabStyle } from '../../lib/stores';
	import type {TabStyle} from '../../lib/rotated-shape'

	export let showControl: string;

	let rotZ: number = ($levelConfig.levelOffset.rotZ * 180) / Math.PI;
	let rotX: number = ($levelConfig.levelOffset.rotX * 180) / Math.PI;
	let rotY: number = ($levelConfig.levelOffset.rotY * 180) / Math.PI;

	let tabStyle: TabStyle = window.structuredClone($bandConfig.tabStyle) 

	$: {
		$levelConfig.levelOffset.rotZ = (rotZ * Math.PI) / 180;
		$levelConfig.levelOffset.rotX = (rotX * Math.PI) / 180;
		$levelConfig.levelOffset.rotY = (rotY * Math.PI) / 180;
	}

	$: {
		console.debug("** ** ** tabStyle", tabStyle, $bandConfig.tabStyle)
		
		$bandConfig.tabStyle = $bandConfig.tabStyle.style !== tabStyle.style ? initTabStyle(tabStyle.style) : window.structuredClone(tabStyle)
		tabStyle = window.structuredClone($bandConfig.tabStyle)
		console.debug("** ** ** tabStyle", tabStyle, $bandConfig.tabStyle)

	}

	const handleLevelsInput = (e: Event & { currentTarget: EventTarget & HTMLInputElement }) => {
		const preval = e.currentTarget.valueAsNumber;
		$levelConfig.levels = preval && preval > 1 && typeof preval === 'number' ? preval : 2;
	};
</script>
{#if showControl === 'Struts'}
	<section class="control-group">
		<div>Struts</div><div></div>
		<label for="render-struts" >Show</label>
		<input id="render-struts" type="checkbox" bind:checked={$renderConfig.show.struts} />
		<label for="strut-tiling">Tiling</label>
		<select id="strut-tiling" bind:value={$strutConfig.tiling}>
			<option>helical-right</option>
			<option disabled>helical-left</option>
			<option disabled>circumference</option>
			<option disabled>triangular</option>
			<option disabled>hexagonal</option>
		</select>
		<label for="strut-width">Width</label>
		<input id="strut-width" type=number min=0 bind:value={$strutConfig.width} />
		<label for="strut-orientation">Orientation</label>
		<select id="strut-orientation" bind:value={$strutConfig.orientation}>
			<option>inside</option>
			<option>outside</option>
			<option>half</option>
		</select>
		<label for="radiate">Radiate Style</label>
		<select id="radiate" bind:value={$strutConfig.radiate}>
			<option>level</option>
			<option>orthogonal</option>
			<option>hybrid</option>
		</select>
	</section>
{:else if showControl === '3D'}
	<section>
		{#if $renderConfig.ranges?.rangeStyle === 'slice'}
			<section class="control-group">
				{#each Object.keys($renderConfig.ranges).filter(key => key !== "rangeStyle") as rangeKey}
					<label for={rangeKey}>{rangeKey}</label>
					<input id={rangeKey} type="number" bind:value={$renderConfig.ranges[rangeKey]} />
				{/each}

				{#if $renderConfig.show}
					<div style="grid-column: 1 / 3; font-size: 20px;">Show</div>
					{#each Object.keys($renderConfig.show) as key}
						<label for={`show-${key}`}>{key}</label>
						<input id={`show-${key}`} type="checkbox" bind:checked={$renderConfig.show[key]} />
					{/each}
				{/if}
			</section>
		{/if}
		<section class="control-group">
			<label for="band-style">Band Style</label>
			<select id="band-style" bind:value={$bandConfig.bandStyle}>
				<option>circumference</option>
				<option>helical-right</option>
				<option>helical-left</option>
			</select>
			<label for="tab-style">Tab Style</label>
			<select id="tab-style" bind:value={tabStyle.style}>
				<option>full</option>
				<option>trapezoid</option>
				<option>multi-facet-full</option>
				<option disabled>multi-facet-trap</option>
			</select>
			<label for="tab-direction">Tab Direction</label>
			<select id="tab-direction" bind:value={tabStyle.direction}>
				<option>greater</option>
				<option>lesser</option>
				<option>both</option>
			</select>
			{#if tabStyle?.style === "trapezoid" && tabStyle?.width?.value !== undefined}
				<label for="tab-width">Tab Width</label>
				<input id="tab-width" type="number" min=1 bind:value={tabStyle.width.value} />
			{/if}
		</section>
	</section>
{:else if showControl === 'Levels'}
	<section class="control-group">
		{#if $levelConfig}
			<label for="levels">Levels</label>
			<input
				id="levels"
				type="number"
				min="1"
				value={$levelConfig.levels}
				on:input={handleLevelsInput}
			/>
			<!-- <div> -->
				<label for="by-divisions">Divisions</label>
				<select id="by-divisions" bind:value={$levelConfig.levelPrototypeSampleMethod.byDivisions}>
					<option>whole</option>
					<option>offsetHalf</option>
				</select>
				<label for="divide-per">Per</label>
				<select id="divide-per" bind:value={$levelConfig.levelPrototypeSampleMethod.dividePer}>
					<option>shape</option>
					<option>curve</option>
				</select>
			<!-- </div>	 -->
			<label for="x_offset">X</label>
			<input id="x_offset" type="number" bind:value={$levelConfig.levelOffset.x} />
			<label for="y_offset">Y</label>
			<input id="y_offset" type="number" bind:value={$levelConfig.levelOffset.y} />
			<label for="z_offset">Z</label>
			<input id="z_offset" type="number" bind:value={$levelConfig.levelOffset.z} />
			<label for="rotx_offset">rotion X</label>
			<input id="rotx_offset" type="number" min={-360} max={360} bind:value={rotX} />
			<label for="roty_offset">rotation Y</label>
			<input id="roty_offset" type="number" min={-360} max={360} bind:value={rotY} />
			<label for="rotz_offset">rotation Z</label>
			<input id="rotz_offset" type="number" min={-360} max={360} bind:value={rotZ} />
		{/if}
	</section>
{:else if showControl === 'Cut'}
	<h4>Cut Pattern</h4>
	<section class="control-group">
		{#each Object.entries($patternConfig.showPattern) as show}
			<label for={`show-${show[0]}`}>{show[0]}</label>
			<select id={`show-${show[0]}`} bind:value={$patternConfig.showPattern[show[0]]}>
				<option>faceted</option>
				<option>outlined</option>
				<option>none</option>
			</select>
		{/each}
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
		grid-template-rows: repeat(10, 1.5em);
	}
	.control-group input {
		width: 40px;
	}
	.control-group select {
		width: 120px;
	}
</style>
