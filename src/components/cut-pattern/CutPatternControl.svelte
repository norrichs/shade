<script lang="ts">
	import { config0 } from '$lib/stores';
	import PanControl from './PanControl.svelte';
</script>

<div class="view-control-box">
	<label for="svg-width">width</label>
	<input
		id="svg-width"
		type="number"
		bind:value={$config0.patternViewConfig.width}
		class="view-control"
	/>
	<label for="svg-height">height</label>
	<input
		id="svg-height"
		type="number"
		bind:value={$config0.patternViewConfig.height}
		class="view-control"
	/>
	<label for="svg-zoom">zoom</label>
	<input
		id="svg-zoom"
		type="number"
		min={-2}
		max={2}
		step={0.1}
		bind:value={$config0.patternViewConfig.zoom}
		class="view-control"
	/>
	<PanControl />
	<label for="svg-offset-x">offset x</label>
	<label for="svg-page-width">page width</label>
	<input
		id="svg-page-width"
		type="number"
		bind:value={$config0.patternConfig.page.width}
		class="view-control"
		step={10}
	/>
	<label for="svg-page-width">page height</label>
	<input
		id="svg-page-height"
		type="number"
		bind:value={$config0.patternConfig.page.height}
		class="view-control"
		step={10}
	/>
	<label for="svg-page-unit">page unit</label>
	<select id="svg-page-unit" bind:value={$config0.patternConfig.page.unit} class="view-control">
		<option>mm</option>
		<option>cm</option>
		<option>in</option>
	</select>
</div>

<style>
	.view-control-box {
		position: absolute;
		top: 20px;
		left: 20px;
		background-color: rgba(0, 0, 0, 0.3);
	}

	.view-control {
		width: 50px;
	}
</style>
