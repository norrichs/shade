<script lang="ts">
	import { getCrossSectionPath } from '$lib/projection-geometry/generate-projection';
	import type {
		CrossSectionConfig,
		ProjectionCurveSampleMethod
	} from '$lib/projection-geometry/types';
	import { superConfigStore, superGlobuleStore } from '$lib/stores';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Button from '../../design-system/Button.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import { endPointsInRange, endPointsZeroX, insertPoint, neighborPointMatch } from './path-editor';
	import PathEditor from './PathEditor.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import type { SilhouetteConfig } from '$lib/types';

	let silhouette: SilhouetteConfig =
		$superConfigStore.subGlobuleConfigs[0].globuleConfig.silhouetteConfig;
</script>

<Editor>
	<section>
		<header>Silhouette</header>
		<Container direction="row">
			<Container direction="column">
				<Button onclick={() => console.log(silhouette)}>Print Silhouette</Button>
				<PathEditor
					curveDef={silhouette.curves}
					onChangeCurveDef={(curveDef) => {
						console.debug('onChangeCurveDef', curveDef);
						$superConfigStore.subGlobuleConfigs[0].globuleConfig.silhouetteConfig.curves = curveDef;
						console.debug('silhouette', silhouette);
						console.debug($superConfigStore.subGlobuleConfigs[0].globuleConfig.silhouetteConfig);
					}}
					config={{
						gutter: 300,
						padding: 100,
						contentBounds: { top: -100, left: -100, width: 200, height: 200 },
						size: { width: 200, height: 200 }
					}}
				>
					<line x1="0" y1="-100" x2="0" y2="100" stroke="black" stroke-width="0.25" />
				</PathEditor>
			</Container>
			<Container direction="column">
				<LabeledControl label="Levels">
					{#if $superConfigStore.subGlobuleConfigs[0].globuleConfig.levelConfig.levelCount !== undefined}
						<NumberInput
							bind:value={
								$superConfigStore.subGlobuleConfigs[0].globuleConfig.levelConfig.levelCount
							}
							hasButtons
						/>
					{/if}
				</LabeledControl>
			</Container>
		</Container>
	</section>
</Editor>

<style>
</style>
