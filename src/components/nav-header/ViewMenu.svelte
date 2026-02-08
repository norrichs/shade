<script lang="ts">
	import { viewControlStore } from '$lib/stores';
	import CheckboxInput from '../controls/CheckboxInput.svelte';
	import PopoverMenu from '../design-system/PopoverMenu.svelte';

	const MENU_NAME = 'view-control-menu';
</script>

<button popovertarget={MENU_NAME} class="standard"> View </button>

<PopoverMenu menuName={MENU_NAME}>
	<header>Show Projection:</header>
	{#each Object.keys($viewControlStore.showProjectionGeometry) as key}
		<div class="entry">
			<input type="checkbox" bind:checked={$viewControlStore.showProjectionGeometry[key]} />
			<span>{key}</span>
		</div>
	{/each}
	<header>Show Globules:</header>
	{#each Object.keys($viewControlStore.showGlobuleGeometry) as key}
		<div class="entry">
			<input type="checkbox" bind:checked={$viewControlStore.showGlobuleGeometry[key]} />
			<span>{key}</span>
		</div>
	{/each}
	<header>Show Globule Tubes:</header>
	{#each Object.keys($viewControlStore.showGlobuleTubeGeometry) as key}
		<div class="entry">
			<input type="checkbox" bind:checked={$viewControlStore.showGlobuleTubeGeometry[key]} />
			<span>{key}</span>
		</div>
	{/each}
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
