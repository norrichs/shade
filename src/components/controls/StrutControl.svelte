<script lang="ts">
	import { configStore0 } from '$lib/stores/stores';
	import ControlGroup from './ControlGroup.svelte';
</script>

<section>
	<ControlGroup>
		<div>Struts</div>
		<div />
		<label for="render-struts">Show</label>
		<input
			id="render-struts"
			type="checkbox"
			bind:checked={$configStore0.renderConfig.show.struts}
		/>
		<label for="strut-tiling">Tiling</label>
		<select id="strut-tiling" bind:value={$configStore0.strutConfig.tiling}>
			<option>helical-right</option>
			<option disabled>helical-left</option>
			<option disabled>circumference</option>
			<option disabled>triangular</option>
			<option disabled>hexagonal</option>
		</select>
		<label for="strut-width">Width</label>
		<input id="strut-width" type="number" min="0" bind:value={$configStore0.strutConfig.width} />
		<label for="strut-orientation">Orientation</label>
		<select id="strut-orientation" bind:value={$configStore0.strutConfig.orientation}>
			<option>inside</option>
			<option>outside</option>
			<option>half</option>
		</select>
		<label for="radiate">Radiate Style</label>
		<select id="radiate" bind:value={$configStore0.strutConfig.radiate}>
			<option>level</option>
			<option>orthogonal</option>
			<option>hybrid</option>
		</select>
	</ControlGroup>
</section>
