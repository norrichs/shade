<script lang="ts">
	import { initTabStyle } from '$lib/shades-config';
	import { superConfigStore, selectedSubGlobuleIndex, selectedBand } from '$lib/stores';
	import type { TabStyle } from '$lib/types';
	import ControlGroup from './ControlGroup.svelte';

	let tabStyle: TabStyle = window.structuredClone(
		$superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig.bandConfig.tabStyle
	);

	$: {
		$superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig.bandConfig.tabStyle =
			$superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig.bandConfig.tabStyle
				.style !== tabStyle.style
				? initTabStyle(tabStyle.style)
				: window.structuredClone(tabStyle);
		tabStyle = window.structuredClone(
			$superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig.bandConfig.tabStyle
		);
	}
</script>

<section>
	{#if $superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig.renderConfig.ranges?.rangeStyle === 'slice'}
		<ControlGroup>
			{#each Object.keys($superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig.renderConfig.ranges).filter((key) => key !== 'rangeStyle') as rangeKey}
				<label for={rangeKey}>{rangeKey}</label>
				<input
					id={rangeKey}
					type="number"
					bind:value={$superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig
						.renderConfig.ranges[rangeKey]}
				/>
			{/each}

			{#if $superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig.renderConfig.show}
				<div style="grid-column: 1 / 3; font-size: 20px;">Show</div>
				{#each Object.keys($superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig.renderConfig.show) as key}
					<label for={`show-${key}`}>{key}</label>
					<input
						id={`show-${key}`}
						type="checkbox"
						bind:checked={$superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig
							.renderConfig.show[key]}
					/>
				{/each}
			{/if}
		</ControlGroup>
	{/if}
	<ControlGroup>
		<label for="band-style">Band Style</label>
		<select
			id="band-style"
			bind:value={$superConfigStore.subGlobuleConfigs[$selectedBand.s].globuleConfig.bandConfig
				.bandStyle}
		>
			<option>circumference</option>
			<option>helical-right</option>
			<option>helical-left</option>
		</select>
		<label for="tab-style">Tab Style</label>
		<select
			id="tab-style"
			bind:value={tabStyle.style}
			on:change={() =>
				($superConfigStore.subGlobuleConfigs[
					$selectedBand.s
				].globuleConfig.renderConfig.show.tabs = true)}
		>
			<option>none</option>
			<option>full</option>
			<option>trapezoid</option>
			<option>multi-facet-full</option>
			<option disabled>multi-facet-trap</option>
		</select>
		<label for="tab-direction">Tab Direction</label>
		<select
			id="tab-direction"
			bind:value={tabStyle.direction}
			on:change={() =>
				($superConfigStore.subGlobuleConfigs[
					$selectedBand.s
				].globuleConfig.renderConfig.show.tabs = true)}
		>
			<option>greater</option>
			<option>lesser</option>
			<option>both</option>
		</select>
		{#if tabStyle?.style === 'trapezoid' && tabStyle?.width?.value !== undefined}
			<label for="tab-width">Tab Width</label>
			<input
				id="tab-width"
				type="number"
				min="1"
				bind:value={tabStyle.width.value}
				on:change={() =>
					($superConfigStore.subGlobuleConfigs[
						$selectedBand.s
					].globuleConfig.renderConfig.show.tabs = true)}
			/>
		{/if}
	</ControlGroup>
</section>
