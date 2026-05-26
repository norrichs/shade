<script lang="ts">
	import { superConfigStore } from '$lib/stores/superGlobuleStores';
	import { defaultVoronoiConfig } from '$lib/shades-config';
	import type { VoronoiConfig, VoronoiMethod } from '$lib/voronoi/types';

	let configs: VoronoiConfig[] = $derived($superConfigStore.voronoiConfigs ?? []);

	function addVoronoi() {
		$superConfigStore = {
			...$superConfigStore,
			voronoiConfigs: [...($superConfigStore.voronoiConfigs ?? []), { ...defaultVoronoiConfig }]
		};
	}

	function removeVoronoi(index: number) {
		const updated = [...($superConfigStore.voronoiConfigs ?? [])];
		updated.splice(index, 1);
		$superConfigStore = {
			...$superConfigStore,
			voronoiConfigs: updated
		};
	}

	function updateConfig(index: number, field: string, value: number | string) {
		const updated = [...($superConfigStore.voronoiConfigs ?? [])];
		if (field === 'pointCount') {
			updated[index] = {
				...updated[index],
				seedConfig: {
					...updated[index].seedConfig,
					seedMethod: { ...updated[index].seedConfig.seedMethod, pointCount: value }
				}
			};
		} else if (field === 'seed') {
			updated[index] = {
				...updated[index],
				seedConfig: {
					...updated[index].seedConfig,
					seedMethod: { ...updated[index].seedConfig.seedMethod, seed: value }
				}
			};
		} else if (field === 'relaxationIterations') {
			updated[index] = {
				...updated[index],
				seedConfig: { ...updated[index].seedConfig, relaxationIterations: value }
			};
		} else if (field === 'edgeDivisions') {
			updated[index] = { ...updated[index], edgeDivisions: value };
		} else if (field === 'voronoiMethod') {
			updated[index] = { ...updated[index], voronoiMethod: value as VoronoiMethod };
		}
		$superConfigStore = { ...$superConfigStore, voronoiConfigs: updated };
	}

	function randomizeSeed(index: number) {
		updateConfig(index, 'seed', Math.floor(Math.random() * 100000));
	}
</script>

<section>
	<header>
		<h3>Voronoi Configs</h3>
		<button onclick={addVoronoi}>Add Voronoi</button>
	</header>

	{#each configs as config, i}
		<div class="config-block">
			<div class="config-header">
				<span>Voronoi {i}</span>
				<button onclick={() => removeVoronoi(i)}>Remove</button>
			</div>

			<label>
				Method
				<select
					value={config.voronoiMethod ?? 'spherical'}
					onchange={(e) => updateConfig(i, 'voronoiMethod', e.currentTarget.value)}
				>
					<option value="spherical">Spherical</option>
					<option value="uv">UV</option>
				</select>
			</label>

			<label>
				Point Count
				<input
					type="range"
					min="4"
					max="50"
					value={config.seedConfig.seedMethod.pointCount}
					oninput={(e) => updateConfig(i, 'pointCount', Number(e.currentTarget.value))}
				/>
				<span>{config.seedConfig.seedMethod.pointCount}</span>
			</label>

			<label>
				Seed
				<input
					type="number"
					value={config.seedConfig.seedMethod.seed}
					oninput={(e) => updateConfig(i, 'seed', Number(e.currentTarget.value))}
				/>
				<button onclick={() => randomizeSeed(i)}>Randomize</button>
			</label>

			<label>
				Relaxation Iterations
				<input
					type="range"
					min="0"
					max="20"
					value={config.seedConfig.relaxationIterations}
					oninput={(e) => updateConfig(i, 'relaxationIterations', Number(e.currentTarget.value))}
				/>
				<span>{config.seedConfig.relaxationIterations}</span>
			</label>

			<label>
				Edge Divisions
				<input
					type="range"
					min="2"
					max="20"
					value={config.edgeDivisions}
					oninput={(e) => updateConfig(i, 'edgeDivisions', Number(e.currentTarget.value))}
				/>
				<span>{config.edgeDivisions}</span>
			</label>
		</div>
	{/each}

	{#if configs.length === 0}
		<p>No Voronoi configs. Click "Add Voronoi" to start.</p>
	{/if}
</section>

<style>
	section {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.config-block {
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.config-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: bold;
	}
	label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	label span {
		min-width: 30px;
		text-align: right;
	}
</style>
