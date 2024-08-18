<script lang="ts">
	import ControlGroup from './ControlGroup.svelte';
	import { config0 } from '$lib/stores';

	let rotZ: number = ($config0.levelConfig.levelOffset.rotZ * 180) / Math.PI;
	let rotX: number = ($config0.levelConfig.levelOffset.rotX * 180) / Math.PI;
	let rotY: number = ($config0.levelConfig.levelOffset.rotY * 180) / Math.PI;
	$: {
		$config0.levelConfig.levelOffset.rotZ = (rotZ * Math.PI) / 180;
		$config0.levelConfig.levelOffset.rotX = (rotX * Math.PI) / 180;
		$config0.levelConfig.levelOffset.rotY = (rotY * Math.PI) / 180;
	}
</script>

<section>
	<ControlGroup>
		{#if $config0.levelConfig}
			<label for="by-divisions">Divisions</label>
			<label for="divide-per">Per</label>
			<select id="divide-per" bind:value={$config0.levelConfig.levelPrototypeSampleMethod}>
				<option>shape</option>
				<option>curve</option>
				<!-- <option></option> -->
			</select>

			<label for="silhouette-sample-method">Z Curve Sample</label>
			<select
				id="silhouette-sample-method"
				bind:value={$config0.levelConfig.silhouetteSampleMethod}
			>
				<!-- <option value="levelInterval">By Level</option> -->
				<option value={{ method: 'divideCurvePath', divisions: 10 }}>By Whole Curve</option>
				<option value={{ method: 'divideCurve', divisions: 3 }}>By Sub-curve</option>
				<option value={{ method: 'preserveAspectRatio', divisions: 10 }}
					>Preserve Aspect Ratio</option
				>
			</select>
			{#if typeof $config0.levelConfig.silhouetteSampleMethod === 'object' && Object.hasOwn($config0.levelConfig.silhouetteSampleMethod, 'method')}
				<label for="silhouette-divisions">Divisions</label>
				<input
					id="silhouette-divisions"
					type="number"
					min="1"
					bind:value={$config0.levelConfig.silhouetteSampleMethod.divisions}
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
	</ControlGroup>
</section>
