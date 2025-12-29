<script lang="ts">
	import ControlGroup from './ControlGroup.svelte';
	import { superConfigStore } from '$lib/stores';
	import { isCurveSampleMethodMethod, type BandAddressed, type GeometryAddress } from '$lib/types';

	let sgIndex = 0;
	const update = (selected: GeometryAddress<BandAddressed>) =>
		(sgIndex = selected === undefined ? 0 : selected.s);

	let rotZ: number =
		($superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig.levelOffsets[0].rotZ *
			180) /
		Math.PI;
	let rotX: number =
		($superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig.levelOffsets[0].rotX *
			180) /
		Math.PI;
	let rotY: number =
		($superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig.levelOffsets[0].rotY *
			180) /
		Math.PI;

	const updateStore = (rotZ: number, rotX: number, rotY: number) => {
		const current =
			$superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig.levelOffsets[0];
		const updated = {
			rotZ: (rotZ * Math.PI) / 180,
			rotX: (rotX * Math.PI) / 180,
			rotY: (rotY * Math.PI) / 180
		};

		if (current.rotZ !== updated.rotZ) {
			$superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig.levelOffsets[0].rotZ =
				(rotZ * Math.PI) / 180;
		}
	};
	const handleSampleChange = (ev: Event) => {
		const target = ev.target as HTMLSelectElement;

		if (isCurveSampleMethodMethod(target.value)) {
			$superConfigStore.subGlobuleConfigs[
				sgIndex
			].globuleConfig.levelConfig.silhouetteSampleMethod.method = target.value;
		}
	};

	$: updateStore(rotZ, rotX, rotY);
</script>

<section>
	<ControlGroup>
		{#if $superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig}
			<label for="silhouette-sample-method">Silhouette Sampling</label>
			<select
				id="silhouette-sample-method"
				value={$superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig
					.silhouetteSampleMethod}
				on:change={handleSampleChange}
			>
				<option
					selected={$superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig
						.silhouetteSampleMethod.method === 'divideCurvePath'}
					value="divideCurvePath">By Whole Curve</option
				>
				<option value="divideCurve">By Sub-curve</option>
				<option selected value="preserveAspectRatio">Preserve Aspect Ratio</option>
			</select>
			{#if typeof $superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig.silhouetteSampleMethod === 'object' && Object.hasOwn($superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig.silhouetteSampleMethod, 'method')}
				<label for="silhouette-divisions">Divisions</label>
				<input
					id="silhouette-divisions"
					type="number"
					min="1"
					bind:value={$superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig
						.silhouetteSampleMethod.divisions}
				/>
			{/if}

			<label for="x_offset">X</label>
			<input
				id="x_offset"
				type="number"
				bind:value={$superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig
					.levelOffsets[0].x}
			/>
			<label for="y_offset">Y</label>
			<input
				id="y_offset"
				type="number"
				bind:value={$superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig
					.levelOffsets[0].y}
			/>
			<label for="z_offset">Z</label>
			<input
				id="z_offset"
				type="number"
				bind:value={$superConfigStore.subGlobuleConfigs[sgIndex].globuleConfig.levelConfig
					.levelOffsets[0].z}
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
