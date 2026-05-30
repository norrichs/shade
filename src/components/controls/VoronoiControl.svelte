<script lang="ts">
	import { superConfigStore } from '$lib/stores/superGlobuleStores';
	import { defaultVoronoiConfig } from '$lib/shades-config';
	import type { VoronoiConfig, VoronoiMethod } from '$lib/voronoi/types';

	let config: VoronoiConfig = $derived($superConfigStore.voronoiConfig ?? defaultVoronoiConfig);

	function update(
		field: 'pointCount' | 'seed' | 'seedMethodType' | 'relaxationIterations' | 'edgeDivisions' | 'curveOffsetFactor' | 'surfaceProjectionDivisions' | 'voronoiMethod',
		value: number | string
	) {
		let next: VoronoiConfig = config;
		if (field === 'pointCount') {
			next = {
				...config,
				seedConfig: {
					...config.seedConfig,
					seedMethod: { ...config.seedConfig.seedMethod, pointCount: value as number }
				}
			};
		} else if (field === 'seed') {
			next = {
				...config,
				seedConfig: {
					...config.seedConfig,
					seedMethod: { ...config.seedConfig.seedMethod, seed: value as number }
				}
			};
		} else if (field === 'seedMethodType') {
			next = {
				...config,
				seedConfig: {
					...config.seedConfig,
					seedMethod: {
						...config.seedConfig.seedMethod,
						type: value as VoronoiConfig['seedConfig']['seedMethod']['type']
					}
				}
			};
		} else if (field === 'relaxationIterations') {
			next = {
				...config,
				seedConfig: { ...config.seedConfig, relaxationIterations: value as number }
			};
		} else if (field === 'edgeDivisions') {
			next = { ...config, edgeDivisions: value as number };
		} else if (field === 'curveOffsetFactor') {
			next = { ...config, curveOffsetFactor: value as number };
		} else if (field === 'surfaceProjectionDivisions') {
			next = { ...config, surfaceProjectionDivisions: value as number };
		} else if (field === 'voronoiMethod') {
			next = { ...config, voronoiMethod: value as VoronoiMethod };
		}
		$superConfigStore = { ...$superConfigStore, voronoiConfig: next };
	}

	function randomizeSeed() {
		update('seed', Math.floor(Math.random() * 2 ** 31));
	}
</script>

<section>
	<header>
		<h3>Voronoi</h3>
	</header>

	<div class="config-block">
		<label>
			Seed Method
			<select
				value={config.seedConfig.seedMethod.type}
				onchange={(e) => update('seedMethodType', e.currentTarget.value)}
			>
				<option value="areaWeighted">Area Weighted</option>
				<option value="centerProjection">Center Projection</option>
			</select>
		</label>

		<label>
			Method
			<select
				value={config.voronoiMethod ?? 'spherical'}
				onchange={(e) => update('voronoiMethod', e.currentTarget.value)}
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
				max="300"
				value={config.seedConfig.seedMethod.pointCount}
				oninput={(e) => update('pointCount', Number(e.currentTarget.value))}
			/>
			<span>{config.seedConfig.seedMethod.pointCount}</span>
		</label>

		<label>
			Seed
			<input
				type="number"
				value={config.seedConfig.seedMethod.seed}
				oninput={(e) => update('seed', Number(e.currentTarget.value))}
			/>
			<button onclick={randomizeSeed}>Randomize</button>
		</label>

		<label>
			Relaxation Iterations
			<input
				type="range"
				min="0"
				max="20"
				value={config.seedConfig.relaxationIterations}
				oninput={(e) => update('relaxationIterations', Number(e.currentTarget.value))}
			/>
			<span>{config.seedConfig.relaxationIterations}</span>
		</label>

		<label>
			Curve Offset
			<input
				type="range"
				min="0.05"
				max="0.95"
				step="0.05"
				value={config.curveOffsetFactor ?? 0.3}
				oninput={(e) => update('curveOffsetFactor', Number(e.currentTarget.value))}
			/>
			<span>{(config.curveOffsetFactor ?? 0.3).toFixed(2)}</span>
		</label>

		<label>
			Surface Divisions
			<input
				type="range"
				min="0"
				max="5"
				step="1"
				value={config.surfaceProjectionDivisions ?? 0}
				oninput={(e) => update('surfaceProjectionDivisions', Number(e.currentTarget.value))}
			/>
			<span>{config.surfaceProjectionDivisions ?? 0}</span>
		</label>

		<label>
			Edge Divisions
			<input
				type="range"
				min="2"
				max="20"
				value={config.edgeDivisions}
				oninput={(e) => update('edgeDivisions', Number(e.currentTarget.value))}
			/>
			<span>{config.edgeDivisions}</span>
		</label>
	</div>
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
