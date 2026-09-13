<script lang="ts">
	import { get } from 'svelte/store';
	import { patternConfigStore } from '$lib/stores';
	import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';
	import {
		defaultCircleHolesFillConfig,
		defaultOutlinedPatternConfig,
		tiledPatternConfigs
	} from '$lib/shades-config';
	import { algorithms } from '$lib/patterns/pattern-registry';
	import type { TiledPatternSpec } from '$lib/patterns/spec-types';
	import type {
		GlobulePatternConfig,
		GridVariant,
		TabEdgeOption,
		TabShape,
		TiledPatternConfig,
		TilingBasis
	} from '$lib/types';
	import { isOutlinedPatternConfig, isTiledPatternConfig } from '$lib/types';
	import PatternTileButton from '../../pattern/PatternTileButton.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import LabeledControl from './LabeledControl.svelte';

	let patternTypeConfig = $derived($patternConfigStore.patternTypeConfig);
	let isOutlined = $derived(isOutlinedPatternConfig(patternTypeConfig));
	let isTiled = $derived(isTiledPatternConfig(patternTypeConfig));
	// PatternTypeConfig is a union and only one arm carries each of these, so the
	// guards narrow first rather than reaching through the union.
	let outlined = $derived(
		isOutlinedPatternConfig(patternTypeConfig) ? patternTypeConfig : undefined
	);
	let tabConfig = $derived(outlined?.tabConfig);
	let fill = $derived(outlined?.fill);
	let inner = $derived((patternTypeConfig as { config: Record<string, any> }).config);

	const update = (mutate: (config: GlobulePatternConfig) => GlobulePatternConfig) =>
		patternConfigStore.set(mutate(get(patternConfigStore)));

	const setPatternType = (patternTypeConfig: GlobulePatternConfig['patternTypeConfig']) =>
		update((config) => ({ ...config, patternTypeConfig }));

	/** Patch the inner algorithm config shared by both pattern families. */
	const setInner = (patch: Record<string, unknown>) =>
		update((config) => ({
			...config,
			patternTypeConfig: {
				...config.patternTypeConfig,
				config: { ...(config.patternTypeConfig as { config: object }).config, ...patch }
			} as GlobulePatternConfig['patternTypeConfig']
		}));

	const setTab = (patch: Record<string, unknown> | undefined) =>
		update((config) => ({
			...config,
			patternTypeConfig: {
				...config.patternTypeConfig,
				tabConfig:
					patch === undefined
						? undefined
						: { ...(config.patternTypeConfig as { tabConfig?: object }).tabConfig, ...patch }
			} as GlobulePatternConfig['patternTypeConfig']
		}));

	/**
	 * Patch the outlined pattern's procedural fill. `undefined` clears it, which
	 * is what turns the fill off; enabling passes a whole default config, which
	 * the spread merges over the absent one.
	 */
	const setFill = (patch: Record<string, unknown> | undefined) =>
		update((config) => ({
			...config,
			patternTypeConfig: {
				...config.patternTypeConfig,
				fill:
					patch === undefined
						? undefined
						: { ...(config.patternTypeConfig as { fill?: object }).fill, ...patch }
			} as GlobulePatternConfig['patternTypeConfig']
		}));

	const setView = (patch: Record<string, boolean>) =>
		update((config) => ({
			...config,
			patternViewConfig: { ...config.patternViewConfig, ...patch }
		}));

	/** 'none' in these selects means "leave the field unset", not a stored value. */
	const optional = (value: string) => (value === 'none' ? undefined : value);

	type TileGroup = {
		algorithmId: string;
		displayName: string;
		tiles: { type: string; tiling: TilingBasis }[];
	};

	const getTileGroups = (
		configs: { [key: string]: TiledPatternConfig },
		variants: TiledPatternSpec[]
	): TileGroup[] => {
		const builtInIds = new Set(algorithms.map((a) => a.defaultSpec.id));
		const algoGroups: TileGroup[] = algorithms.map((a) => {
			const builtIn = { type: a.defaultSpec.id, tiling: 'quadrilateral' as TilingBasis };
			const userVariants = variants
				.filter((v) => !builtInIds.has(v.id) && v.algorithm === a.algorithmId)
				.map((v) => ({ type: v.id, tiling: 'quadrilateral' as TilingBasis }));
			return {
				algorithmId: a.algorithmId,
				displayName: a.displayName,
				tiles: [builtIn, ...userVariants]
			};
		});
		const legacyTiles = (['quadrilateral', 'triangle', 'band'] as TilingBasis[])
			.flatMap((tiling) =>
				Object.values(configs).filter((c) => c.tiling === tiling && !builtInIds.has(c.type))
			)
			.map((c) => ({ type: c.type, tiling: c.tiling }));
		return [{ algorithmId: 'legacy', displayName: 'Other', tiles: legacyTiles }, ...algoGroups];
	};

	let tileGroups = $derived(getTileGroups(tiledPatternConfigs, $tilePatternSpecStore.variants));

	const tabShapes: TabShape[] = ['rectangle', 'rounded', 'inset', 'partner', 'partner-inset'];
	const edgeOptions = ['none', 'before', 'after', 'beforeAndAfter'];
</script>

<Editor>
	<section>
		<header>Pattern</header>

		<div class="family">
			<button
				class:active={isTiled}
				onclick={() => setPatternType(tiledPatternConfigs['tiledShieldTesselationPattern'])}
				>Tiled</button
			>
			<button
				class:active={isOutlined}
				onclick={() => setPatternType(defaultOutlinedPatternConfig())}>Outlined</button
			>
		</div>

		{#if isTiled}
			<div class="tiles">
				{#each tileGroups as group (group.algorithmId)}
					{#if group.tiles.length > 0}
						<div class="group-header">{group.displayName}</div>
						<div class="option-tile-group">
							{#each group.tiles as tile}
								<PatternTileButton size={45} patternType={tile.type} tilingBasis={tile.tiling} />
							{/each}
						</div>
					{/if}
				{/each}
			</div>
		{/if}

		<Container direction="row">
			<Container direction="column">
				{#if isOutlined}
					<header class="group">Tabs</header>
					<LabeledControl label="Enable Tabs">
						<input
							type="checkbox"
							checked={!!tabConfig}
							onchange={(event) =>
								setTab(
									(event.currentTarget as HTMLInputElement).checked
										? { bandEdge: 'before', shape: 'rectangle', tabWidth: 5 }
										: undefined
								)}
						/>
					</LabeledControl>
					{#if tabConfig}
						<LabeledControl label="Shape">
							<select
								value={tabConfig.shape}
								onchange={(event) =>
									setTab({ shape: (event.currentTarget as HTMLSelectElement).value })}
							>
								{#each tabShapes as shape}<option value={shape}>{shape}</option>{/each}
							</select>
						</LabeledControl>
						<LabeledControl label="Width">
							<input
								type="number"
								value={tabConfig.tabWidth}
								onchange={(event) =>
									setTab({ tabWidth: (event.currentTarget as HTMLInputElement).valueAsNumber })}
							/>
						</LabeledControl>
						{#if tabConfig.shape === 'inset' || tabConfig.shape === 'partner-inset'}
							<LabeledControl label="Inset">
								<input
									type="number"
									value={tabConfig.inset}
									onchange={(event) =>
										setTab({ inset: (event.currentTarget as HTMLInputElement).valueAsNumber })}
								/>
							</LabeledControl>
						{/if}
						<LabeledControl label="Band Edge">
							<select
								value={tabConfig.bandEdge ?? 'none'}
								onchange={(event) =>
									setTab({
										bandEdge: optional(
											(event.currentTarget as HTMLSelectElement).value
										) as TabEdgeOption
									})}
							>
								{#each edgeOptions as option}<option value={option}>{option}</option>{/each}
							</select>
						</LabeledControl>
						<LabeledControl label="Adjacent Layout">
							<select
								value={tabConfig.tabLayout ?? 'none'}
								onchange={(event) =>
									setTab({ tabLayout: optional((event.currentTarget as HTMLSelectElement).value) })}
							>
								<option value="none">none (legacy)</option>
								<option value="inner">inner</option>
								<option value="outer">outer</option>
							</select>
						</LabeledControl>
						<LabeledControl label="Band End">
							<select
								value={tabConfig.bandEnd ?? 'none'}
								onchange={(event) =>
									setTab({
										bandEnd: optional(
											(event.currentTarget as HTMLSelectElement).value
										) as TabEdgeOption
									})}
							>
								{#each edgeOptions as option}<option value={option}>{option}</option>{/each}
							</select>
						</LabeledControl>
					{/if}

					<header class="group">Procedural Fill</header>
					<LabeledControl label="Enable Fill">
						<input
							type="checkbox"
							checked={!!fill}
							onchange={(event) =>
								setFill(
									(event.currentTarget as HTMLInputElement).checked
										? defaultCircleHolesFillConfig()
										: undefined
								)}
						/>
					</LabeledControl>
					{#if fill}
						<LabeledControl label="Density">
							<input
								type="number"
								min="0.0001"
								step="0.0005"
								value={fill.density}
								onchange={(event) =>
									setFill({ density: (event.currentTarget as HTMLInputElement).valueAsNumber })}
							/>
						</LabeledControl>
						<LabeledControl label="Margin">
							<input
								type="number"
								min="0"
								step="0.5"
								value={fill.margin}
								onchange={(event) =>
									setFill({ margin: (event.currentTarget as HTMLInputElement).valueAsNumber })}
							/>
						</LabeledControl>
						<LabeledControl label="Min Radius">
							<input
								type="number"
								min="0.5"
								step="0.5"
								value={fill.minRadius}
								onchange={(event) =>
									setFill({ minRadius: (event.currentTarget as HTMLInputElement).valueAsNumber })}
							/>
						</LabeledControl>
						<LabeledControl label="Max Radius">
							<input
								type="number"
								min="0.5"
								step="0.5"
								value={fill.maxRadius}
								onchange={(event) =>
									setFill({ maxRadius: (event.currentTarget as HTMLInputElement).valueAsNumber })}
							/>
						</LabeledControl>
						<LabeledControl label="Circle Spacing">
							<input
								type="number"
								min="0"
								step="0.5"
								value={fill.spacing}
								onchange={(event) =>
									setFill({ spacing: (event.currentTarget as HTMLInputElement).valueAsNumber })}
							/>
						</LabeledControl>
						<LabeledControl label="Seed {fill.seed}">
							<button onclick={() => setFill({ seed: Math.floor(Math.random() * 1000000) + 1 })}>
								Reroll
							</button>
						</LabeledControl>
					{/if}
				{/if}

				{#if isTiled}
					<header class="group">Tiling</header>
					{#if inner.variant}
						<LabeledControl label="Variant">
							<select
								value={inner.variant}
								onchange={(event) =>
									setInner({
										variant: ((event.currentTarget as HTMLSelectElement).value ||
											'rect') as GridVariant
									})}
							>
								{#each ['rect', 'triangle-0', 'triangle-1'] as option}<option>{option}</option
									>{/each}
							</select>
						</LabeledControl>
					{/if}
					{#if inner.rowCount && inner.columnCount}
						{#if patternTypeConfig.type !== 'tiledHexparquetPattern-0'}
							<LabeledControl label="Rows">
								<input
									type="number"
									min="1"
									max="5"
									value={inner.rowCount}
									onchange={(event) =>
										setInner({
											rowCount: (event.currentTarget as HTMLInputElement).valueAsNumber
										})}
								/>
							</LabeledControl>
						{/if}
						<LabeledControl label="Columns">
							<input
								type="number"
								min="1"
								max="5"
								value={inner.columnCount}
								onchange={(event) =>
									setInner({
										columnCount: (event.currentTarget as HTMLInputElement).valueAsNumber
									})}
							/>
						</LabeledControl>
					{/if}
					<LabeledControl label="Dynamic Stroke">
						<select
							value={inner.dynamicStroke}
							onchange={(event) =>
								setInner({ dynamicStroke: (event.currentTarget as HTMLSelectElement).value })}
						>
							<option value="quadWidth">quadWidth</option>
							<option value="quadHeight">quadHeight</option>
						</select>
					</LabeledControl>
					<LabeledControl label="Stroke min">
						<input
							type="number"
							min="0.1"
							step="0.1"
							value={inner.dynamicStrokeMin}
							onchange={(event) =>
								setInner({
									dynamicStrokeMin: (event.currentTarget as HTMLInputElement).valueAsNumber
								})}
						/>
					</LabeledControl>
					<LabeledControl label="Stroke max">
						<input
							type="number"
							max="20"
							step="0.1"
							value={inner.dynamicStrokeMax}
							onchange={(event) =>
								setInner({
									dynamicStrokeMax: (event.currentTarget as HTMLInputElement).valueAsNumber
								})}
						/>
					</LabeledControl>
					{#if inner.skipEdges}
						<LabeledControl label="Skip Edges">
							<select
								value={inner.skipEdges}
								onchange={(event) =>
									setInner({ skipEdges: (event.currentTarget as HTMLSelectElement).value })}
							>
								{#each ['all', 'none', 'not-first', 'not-last', 'not-both'] as option}
									<option value={option}>{option}</option>
								{/each}
							</select>
						</LabeledControl>
					{/if}
					<LabeledControl label="Match Ends">
						<input
							type="checkbox"
							checked={!!inner.endsMatched}
							onchange={(event) =>
								setInner({ endsMatched: (event.currentTarget as HTMLInputElement).checked })}
						/>
					</LabeledControl>
					<LabeledControl label="Trim Ends">
						<input
							type="checkbox"
							checked={!!inner.endsTrimmed}
							onchange={(event) =>
								setInner({ endsTrimmed: (event.currentTarget as HTMLInputElement).checked })}
						/>
					</LabeledControl>
					{#if patternTypeConfig.type === 'tiledGridPattern-0'}
						<LabeledControl label="Drop Edge Segments">
							<input
								type="checkbox"
								checked={!!inner.dropEdgeSegments}
								onchange={(event) =>
									setInner({
										dropEdgeSegments: (event.currentTarget as HTMLInputElement).checked
									})}
							/>
						</LabeledControl>
					{/if}
					<LabeledControl label="Loop Ends">
						<input
							type="number"
							value={inner.endLooped}
							onchange={(event) =>
								setInner({ endLooped: (event.currentTarget as HTMLInputElement).valueAsNumber })}
						/>
					</LabeledControl>
				{/if}
			</Container>

			<Container direction="column">
				<header class="group">View</header>
				<LabeledControl label="Show Bands">
					<input
						type="checkbox"
						checked={$patternConfigStore.patternViewConfig.showBands}
						onchange={(event) =>
							setView({ showBands: (event.currentTarget as HTMLInputElement).checked })}
					/>
				</LabeledControl>
				<LabeledControl label="Show Quads">
					<input
						type="checkbox"
						checked={$patternConfigStore.patternViewConfig.showQuads}
						onchange={(event) =>
							setView({ showQuads: (event.currentTarget as HTMLInputElement).checked })}
					/>
				</LabeledControl>
				<LabeledControl label="Show Triangles">
					<input
						type="checkbox"
						checked={$patternConfigStore.patternViewConfig.showTriangles}
						onchange={(event) =>
							setView({ showTriangles: (event.currentTarget as HTMLInputElement).checked })}
					/>
				</LabeledControl>
				<LabeledControl label="Show Labels">
					<input
						type="checkbox"
						checked={$patternConfigStore.patternViewConfig.showLabels}
						onchange={(event) =>
							setView({ showLabels: (event.currentTarget as HTMLInputElement).checked })}
					/>
				</LabeledControl>
			</Container>
		</Container>
	</section>
</Editor>

<style>
	.family {
		display: flex;
		gap: 4px;
		padding: 4px;
	}
	.family button.active {
		font-weight: bold;
		text-decoration: underline;
	}
	header.group {
		background-color: rgba(0, 0, 0, 0.06);
		padding: 2px 4px;
		font-size: 0.85em;
	}
	.tiles {
		display: flex;
		flex-direction: column;
		max-width: 520px;
	}
	.group-header {
		font-size: 0.85em;
		color: rgba(0, 0, 0, 0.6);
		padding: 6px 4px 2px;
	}
	.option-tile-group {
		display: flex;
		flex-direction: row;
		gap: 4px;
		overflow-x: auto;
		padding: 4px;
	}
</style>
