<script lang="ts">
	import { getCrossSectionPath } from '$lib/projection-geometry/generate-projection';

	import { superConfigStore, superGlobuleStore } from '$lib/stores';
	import { get } from 'svelte/store';
	import LabeledControl from './LabeledControl.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import { polyhedronConfigs } from './polyhedra-configs';
	import TransformControls from './TransformControls.svelte';
	import { identityTransform, isInheritedTransform } from './transform-config';
	import { resolveEdgeSampling } from '$lib/projection-geometry/edge-sampling';
	import type {
		BaseProjectionConfig,
		EdgeSamplingConfig,
		SurfaceProjectionConfig
	} from '$lib/projection-geometry/types';

	const sampling = $derived(
		resolveEdgeSampling($superConfigStore.projectionConfigs[0]?.edgeSampling)
	);
	const surfaceProjection = $derived(
		$superConfigStore.projectionConfigs[0]?.surfaceProjectionConfig ?? { divisions: 0 }
	);

	// Replace the first projection config so the store emits and generation reruns.
	const updateProjection = (patch: (pc: BaseProjectionConfig) => Partial<BaseProjectionConfig>) => {
		$superConfigStore = {
			...$superConfigStore,
			projectionConfigs: $superConfigStore.projectionConfigs.map((pc, i) =>
				i === 0 ? { ...pc, ...patch(pc) } : pc
			)
		};
	};

	const setSampling = (fields: EdgeSamplingConfig) =>
		updateProjection((pc) => ({ edgeSampling: { ...pc.edgeSampling, ...fields } }));

	const setSurfaceProjection = (fields: Partial<SurfaceProjectionConfig>) =>
		updateProjection((pc) => ({
			surfaceProjectionConfig: { divisions: 0, ...pc.surfaceProjectionConfig, ...fields }
		}));

	// Keep min <= max by moving the other end, as the Voronoi panel does.
	const setMinDivisions = (min: number) =>
		setSampling({ edgeDivisions: [min, Math.max(min, sampling.edgeDivisions[1])] });
	const setMaxDivisions = (max: number) =>
		setSampling({ edgeDivisions: [Math.min(max, sampling.edgeDivisions[0]), max] });

	const handleChangePolyhedron = (event: Event) => {
		const selectedName = (event.target as HTMLSelectElement).value;
		const newPolyhedron = polyhedronConfigs.find((p) => p.name === selectedName);

		if (newPolyhedron) {
			const config = get(superConfigStore);
			// Every polyhedron model ships `transform: 'inherit'`, which resolves to a
			// hardcoded identity with no editor anywhere — so the polyhedron transform
			// was unreachable, exactly as the surface transform was. Materialise on
			// selection so the controls below have something to bind to; identity seed
			// means nothing moves. See ./transform-config.
			config.projectionConfigs[0].projectorConfig.polyhedron = {
				...(newPolyhedron as any),
				transform: identityTransform()
			};
			superConfigStore.set(config);
		}
	};

	// Same materialisation for the polyhedron already in the config (a fresh app
	// load, or any saved config predating this). No-op after the first run.
	$effect(() => {
		const polyhedron = $superConfigStore.projectionConfigs[0]?.projectorConfig?.polyhedron;
		if (!polyhedron || !isInheritedTransform(polyhedron.transform)) return;
		const config = get(superConfigStore);
		config.projectionConfigs[0].projectorConfig.polyhedron = {
			...config.projectionConfigs[0].projectorConfig.polyhedron,
			transform: identityTransform()
		};
		superConfigStore.set(config);
	});
</script>

<Editor>
	<section>
		<header>
			{$superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.name}
		</header>
		<Container direction="column">
			<LabeledControl label="Polyhedron:">
				<select
					value={$superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.name}
					onchange={handleChangePolyhedron}
				>
					{#each polyhedronConfigs as polyhedron}
						<option value={polyhedron.name}>{polyhedron.name}</option>
					{/each}
				</select>
			</LabeledControl>
			{#if $superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.transform !== 'inherit'}
				<TransformControls
					bind:transform={
						$superConfigStore.projectionConfigs[0].projectorConfig.polyhedron.transform
					}
				/>
			{/if}
		</Container>
	</section>
	<section>
		<header>Edges</header>
		<Container direction="column">
			<LabeledControl label="Curve:">
				<select
					class="option"
					value={sampling.curveSource}
					onchange={(e) =>
						setSampling({
							curveSource: e.currentTarget.value as EdgeSamplingConfig['curveSource']
						})}
				>
					<option value="edgeCurve">Edge curve</option>
					<option value="offset">Offset</option>
				</select>
			</LabeledControl>
			<LabeledControl label="Curve offset:" show={sampling.curveSource === 'offset'}>
				<span class="slider">
					<input
						type="range"
						min="0.05"
						max="0.95"
						step="0.05"
						value={sampling.curveOffset}
						oninput={(e) => setSampling({ curveOffset: Number(e.currentTarget.value) })}
					/>
					<span>{sampling.curveOffset.toFixed(2)}</span>
				</span>
			</LabeledControl>
			<LabeledControl label="Divisions:">
				<select
					class="option"
					value={sampling.divisionsSource}
					onchange={(e) =>
						setSampling({
							divisionsSource: e.currentTarget.value as EdgeSamplingConfig['divisionsSource']
						})}
				>
					<option value="edgeCurve">Edge curve</option>
					<option value="adaptive">Adaptive</option>
				</select>
			</LabeledControl>
			<LabeledControl label="Min:" show={sampling.divisionsSource === 'adaptive'}>
				<span class="slider">
					<input
						type="range"
						min="1"
						max="20"
						value={sampling.edgeDivisions[0]}
						oninput={(e) => setMinDivisions(Number(e.currentTarget.value))}
					/>
					<span>{sampling.edgeDivisions[0]}</span>
				</span>
			</LabeledControl>
			<LabeledControl label="Max:" show={sampling.divisionsSource === 'adaptive'}>
				<span class="slider">
					<input
						type="range"
						min="1"
						max="20"
						value={sampling.edgeDivisions[1]}
						oninput={(e) => setMaxDivisions(Number(e.currentTarget.value))}
					/>
					<span>{sampling.edgeDivisions[1]}</span>
				</span>
			</LabeledControl>
			<LabeledControl label="Multiplier:">
				<input
					type="number"
					min="1"
					step="1"
					value={sampling.edgeDivisionsMultiplier}
					onchange={(e) => setSampling({ edgeDivisionsMultiplier: Number(e.currentTarget.value) })}
				/>
			</LabeledControl>
		</Container>
	</section>
	<section>
		<header>Surface</header>
		<Container direction="column">
			<LabeledControl label="Surface divisions:">
				<span class="slider">
					<input
						type="range"
						min="0"
						max="5"
						step="1"
						value={surfaceProjection.divisions}
						oninput={(e) => setSurfaceProjection({ divisions: Number(e.currentTarget.value) })}
					/>
					<span>{surfaceProjection.divisions}</span>
				</span>
			</LabeledControl>
			<LabeledControl label="Fill all:">
				<input
					type="checkbox"
					checked={surfaceProjection.fillAll ?? false}
					onchange={(e) => setSurfaceProjection({ fillAll: e.currentTarget.checked })}
				/>
			</LabeledControl>
		</Container>
	</section>
</Editor>

<style>
	.slider {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.slider span {
		min-width: 2.5em;
		text-align: right;
	}
	select.option {
		font-size: 1rem;
		font-weight: normal;
		width: auto;
	}
	select {
		border: none;
		background-color: transparent;
		font-size: 1.2rem;
		font-weight: bold;
		color: black;
		width: 100%;
	}
	option {
		background-color: white;
	}
</style>
