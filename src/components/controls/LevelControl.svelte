<script lang="ts">
	import ControlGroup from './ControlGroup.svelte';
	import { superConfigStore, selectedSubGlobuleIndex, selectedGlobuleConfig } from '$lib/stores';

	let rotZ: number =
		($superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig.levelConfig
			.levelOffsets[0].rotZ *
			180) /
		Math.PI;
	let rotX: number =
		($superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig.levelConfig
			.levelOffsets[0].rotX *
			180) /
		Math.PI;
	let rotY: number =
		($superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig.levelConfig
			.levelOffsets[0].rotY *
			180) /
		Math.PI;

	const updateStore = (rotation: { rotZ: number; rotX: number; rotY: number }) => {
		const updated = {
			rotZ: (rotation.rotZ * Math.PI) / 180,
			rotX: (rotation.rotX * Math.PI) / 180,
			rotY: (rotation.rotY * Math.PI) / 180
		};

		$superConfigStore.subGlobuleConfigs[
			$selectedSubGlobuleIndex
		].globuleConfig.levelConfig.levelOffsets[0] = {
			...$superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig.levelConfig
				.levelOffsets[0],
			...updated
		};
	};

	$: updateStore({ rotZ, rotX, rotY });

</script>

<section>
	<ControlGroup>
		{#if $superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig.levelConfig}
			<!-- <label for="by-divisions">Divisions</label> -->
			<label for="divide-per">Per</label>
			<select
				id="divide-per"
				bind:value={$superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig
					.levelConfig.levelPrototypeSampleMethod}
			>
				<option>shape</option>
				<option>curve</option>
				<!-- <option></option> -->
			</select>

			<label for="silhouette-sample-method">Z Curve Sample</label>
			<select
				id="silhouette-sample-method"
				bind:value={$superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig
					.levelConfig.silhouetteSampleMethod}
			>
				<!-- <option value="levelInterval">By Level</option> -->
				<option value={{ method: 'divideCurvePath', divisions: 10 }}>By Whole Curve</option>
				<option value={{ method: 'divideCurve', divisions: 3 }}>By Sub-curve</option>
				<option value={{ method: 'preserveAspectRatio', divisions: 10 }}
					>Preserve Aspect Ratio</option
				>
			</select>
			{#if typeof $superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig.levelConfig.silhouetteSampleMethod === 'object' && Object.hasOwn($superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig.levelConfig.silhouetteSampleMethod, 'method')}
				<label for="silhouette-divisions">Divisions</label>
				<input
					id="silhouette-divisions"
					type="number"
					min="1"
					bind:value={$superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig
						.levelConfig.silhouetteSampleMethod.divisions}
				/>
			{/if}

			<label for="x_offset">X</label>
			<input
				id="x_offset"
				type="number"
				bind:value={$superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig
					.levelConfig.levelOffsets[0].x}
			/>
			<label for="y_offset">Y</label>
			<input
				id="y_offset"
				type="number"
				bind:value={$superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig
					.levelConfig.levelOffsets[0].y}
			/>
			<label for="z_offset">Z</label>
			<input
				id="z_offset"
				type="number"
				bind:value={$superConfigStore.subGlobuleConfigs[$selectedSubGlobuleIndex].globuleConfig
					.levelConfig.levelOffsets[0].z}
			/>
			<label for="rotx_offset">rotion X</label>
			<input id="rotx_offset" type="number" min={-360} max={360} bind:value={rotX} />
			<label for="roty_offset">rotation Y</label>
			<input id="roty_offset" type="number" min={-360} max={360} bind:value={rotY} />
			<label for="rotz_offset">rotation Z</label>
			<input id="rotz_offset" type="number" min={-360} max={360} step={0.05} bind:value={rotZ} />
		{/if}
	</ControlGroup>
</section>
