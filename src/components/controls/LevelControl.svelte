<script lang="ts">
	import ControlGroup from './ControlGroup.svelte';
	import { configStore0, superConfigStore, selectedGlobule } from '$lib/stores';
	import type { Id } from '$lib/types';

	let rotZ: number = ($configStore0.levelConfig.levelOffsets[0].rotZ * 180) / Math.PI;
	let rotX: number = ($configStore0.levelConfig.levelOffsets[0].rotX * 180) / Math.PI;
	let rotY: number = ($configStore0.levelConfig.levelOffsets[0].rotY * 180) / Math.PI;

	let selectedSubGlobuleIndex: number = 0;
	const updateSelection = (globuleConfigId?: Id) => {
		console.debug('updateSelection', { globuleConfigId, $superConfigStore });
		const index = globuleConfigId
			? $superConfigStore.subGlobuleConfigs.findIndex(
					(subGlobuleConfig) => subGlobuleConfig.globuleConfig.id === globuleConfigId
			  )
			: undefined;
		if (index) {
			selectedSubGlobuleIndex = index;
		}
	};

	$: {
		updateSelection($selectedGlobule.globuleId);
	}

	$: {
		$superConfigStore.subGlobuleConfigs[
			selectedSubGlobuleIndex
		].globuleConfig.levelConfig.levelOffsets[0].rotZ = (rotZ * Math.PI) / 180;
		$superConfigStore.subGlobuleConfigs[
			selectedSubGlobuleIndex
		].globuleConfig.levelConfig.levelOffsets[0].rotX = (rotX * Math.PI) / 180;
		$superConfigStore.subGlobuleConfigs[
			selectedSubGlobuleIndex
		].globuleConfig.levelConfig.levelOffsets[0].rotY = (rotY * Math.PI) / 180;
	}
</script>

<section>
	<ControlGroup>
		{#if $configStore0.levelConfig}
			<label for="by-divisions">Divisions</label>
			<label for="divide-per">Per</label>
			<select
				id="divide-per"
				bind:value={$superConfigStore.subGlobuleConfigs[selectedSubGlobuleIndex].globuleConfig
					.levelConfig.levelPrototypeSampleMethod}
			>
				<option>shape</option>
				<option>curve</option>
				<!-- <option></option> -->
			</select>

			<label for="silhouette-sample-method">Z Curve Sample</label>
			<select
				id="silhouette-sample-method"
				bind:value={$superConfigStore.subGlobuleConfigs[selectedSubGlobuleIndex].globuleConfig
					.levelConfig.silhouetteSampleMethod}
			>
				<!-- <option value="levelInterval">By Level</option> -->
				<option value={{ method: 'divideCurvePath', divisions: 10 }}>By Whole Curve</option>
				<option value={{ method: 'divideCurve', divisions: 3 }}>By Sub-curve</option>
				<option value={{ method: 'preserveAspectRatio', divisions: 10 }}
					>Preserve Aspect Ratio</option
				>
			</select>
			{#if typeof $superConfigStore.subGlobuleConfigs[selectedSubGlobuleIndex].globuleConfig.levelConfig.silhouetteSampleMethod === 'object' && Object.hasOwn($configStore0.levelConfig.silhouetteSampleMethod, 'method')}
				<label for="silhouette-divisions">Divisions</label>
				<input
					id="silhouette-divisions"
					type="number"
					min="1"
					bind:value={$superConfigStore.subGlobuleConfigs[selectedSubGlobuleIndex].globuleConfig
						.levelConfig.silhouetteSampleMethod.divisions}
				/>
			{/if}

			<label for="x_offset">X</label>
			<input
				id="x_offset"
				type="number"
				bind:value={$superConfigStore.subGlobuleConfigs[selectedSubGlobuleIndex].globuleConfig
					.levelConfig.levelOffsets[0].x}
			/>
			<label for="y_offset">Y</label>
			<input
				id="y_offset"
				type="number"
				bind:value={$superConfigStore.subGlobuleConfigs[selectedSubGlobuleIndex].globuleConfig
					.levelConfig.levelOffsets[0].y}
			/>
			<label for="z_offset">Z</label>
			<input
				id="z_offset"
				type="number"
				bind:value={$superConfigStore.subGlobuleConfigs[selectedSubGlobuleIndex].globuleConfig
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
