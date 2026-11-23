<script lang="ts">
	import { viewControlStore } from '#lib/stores/index.js';
	import { patternOnModelStore } from '#lib/stores/patternOnModelStore.js';
	import CheckboxInput from '../controls/CheckboxInput.svelte';
	import PopoverMenu from '../design-system/PopoverMenu.svelte';

	const MENU_NAME = 'view-control-menu';
</script>

<button popovertarget={MENU_NAME} class="standard"> View </button>

<PopoverMenu menuName={MENU_NAME}>
	<header>Show Projection:</header>
	{#each Object.keys($viewControlStore.showProjectionGeometry) as key (key)}
		<div class="entry">
			<input type="checkbox" bind:checked={$viewControlStore.showProjectionGeometry[key]} />
			<span>{key}</span>
		</div>
	{/each}
	<header>Show Globule Tubes:</header>
	{#each Object.keys($viewControlStore.showGlobuleTubeGeometry) as key (key)}
		<div class="entry">
			<input type="checkbox" bind:checked={$viewControlStore.showGlobuleTubeGeometry[key]} />
			<span>{key}</span>
		</div>
	{/each}
	<header>Show Voronoi:</header>
	{#each Object.keys($viewControlStore.showVoronoiGeometry) as key (key)}
		<div class="entry">
			<input type="checkbox" bind:checked={$viewControlStore.showVoronoiGeometry[key]} />
			<span>{key}</span>
		</div>
	{/each}
	<header>Pattern on model:</header>
	<div class="entry">
		<input type="checkbox" bind:checked={$patternOnModelStore.enabled} />
		<span>show</span>
	</div>
	<div class="entry">
		<input type="checkbox" bind:checked={$patternOnModelStore.interiorLight} />
		<span>lit from inside</span>
	</div>
	<div class="entry">
		<select bind:value={$patternOnModelStore.density}>
			{#each [1, 2, 3, 4] as d (d)}
				<option value={d}>{d} px/unit</option>
			{/each}
		</select>
		<span>texture density</span>
	</div>
	<div class="entry">
		<input type="color" bind:value={$patternOnModelStore.modelColor} />
		<span>model color</span>
	</div>
	<div class="entry">
		<input
			type="range"
			min="0"
			max="1"
			step="0.05"
			bind:value={$patternOnModelStore.modelOpacity}
		/>
		<span>opacity {Math.round($patternOnModelStore.modelOpacity * 100)}%</span>
	</div>
</PopoverMenu>

<style>
	.standard {
		background-color: var(--color-active);
		outline: none;
		border: none;
		border-radius: 4px;
		padding: 6px 10px;
		box-shadow: 2px 2px 10px 0px var(--color-shaded-dark);
		position: relative;
	}
</style>
