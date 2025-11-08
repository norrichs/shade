<script lang="ts">
	import Editor from './Editor.svelte';
	import { patternConfigStore } from '$lib/stores';
	import LabeledControl from './LabeledControl.svelte';
	import Container from './Container.svelte';
	import { tiledPatternConfigs } from '$lib/shades-config';
	import PatternTileButton from '../../pattern/PatternTileButton.svelte';

	const getTiles = (configs: { [key: string]: TiledPatternConfig }) => {
		return ['quadrilateral', 'triangle', 'band']
			.map((tilingBasis) => {
				return Object.values(configs).filter((config) => config.tiling === tilingBasis);
			})
			.flat();
	};
</script>

<Editor>
	<section>
		<Container direction="row">
			<Container direction="column">
				<header>Patterns</header>
				<div class="option-tile-group">
					{#each getTiles(tiledPatternConfigs) as config}
						<PatternTileButton size={20} patternType={config.type} tilingBasis={config.tiling} />
					{/each}
				</div>
			</Container>
			<Container direction="column">
				<header>View</header>
				<LabeledControl label="Show Bands">
					<input type="checkbox" bind:checked={$patternConfigStore.patternViewConfig.showBands} />
				</LabeledControl>
				<LabeledControl label="Show Quads">
					<input type="checkbox" bind:checked={$patternConfigStore.patternViewConfig.showQuads} />
				</LabeledControl>
				<LabeledControl label="Show Triangles">
					<input
						type="checkbox"
						bind:checked={$patternConfigStore.patternViewConfig.showTriangles}
					/>
				</LabeledControl>
				<LabeledControl label="Show Labels">
					<input type="checkbox" bind:checked={$patternConfigStore.patternViewConfig.showLabels} />
				</LabeledControl>
			</Container>
		</Container>
	</section>
</Editor>
