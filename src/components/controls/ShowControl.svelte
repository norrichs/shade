<script lang="ts">
	import type { TabStyle } from '$lib/generate-shape';
	import { initTabStyle } from '$lib/shades-config';
	import { config0 } from '$lib/stores';
	import ControlGroup from './ControlGroup.svelte';

	let tabStyle: TabStyle = window.structuredClone($config0.bandConfig.tabStyle);

	$: {
		$config0.bandConfig.tabStyle =
			$config0.bandConfig.tabStyle.style !== tabStyle.style
				? initTabStyle(tabStyle.style)
				: window.structuredClone(tabStyle);
		tabStyle = window.structuredClone($config0.bandConfig.tabStyle);
	}
</script>

<section>
	{#if $config0.renderConfig.ranges?.rangeStyle === 'slice'}
		<ControlGroup>
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
		</ControlGroup>
	{/if}
	<ControlGroup>
		<label for="band-style">Band Style</label>
		<select id="band-style" bind:value={$config0.bandConfig.bandStyle}>
			<option>circumference</option>
			<option>helical-right</option>
			<option>helical-left</option>
		</select>
		<label for="tab-style">Tab Style</label>
		<select
			id="tab-style"
			bind:value={tabStyle.style}
			on:change={() => ($config0.renderConfig.show.tabs = true)}
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
			on:change={() => ($config0.renderConfig.show.tabs = true)}
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
				on:change={() => ($config0.renderConfig.show.tabs = true)}
			/>
		{/if}
	</ControlGroup>
</section>
