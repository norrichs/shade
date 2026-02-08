<script lang="ts">
	import { getCrossSectionPath } from '$lib/projection-geometry/generate-projection';
	import type {
		CrossSectionConfig,
		ProjectionCurveSampleMethod
	} from '$lib/projection-geometry/types';
	import { superConfigStore, superGlobuleStore } from '$lib/stores';
	import { get } from 'svelte/store';
	import NumberInput from '../../controls/super-control/NumberInput.svelte';
	import Button from '../../design-system/Button.svelte';
	import LabeledControl from './LabeledControl.svelte';
	import { endPointsInRange, endPointsZeroX, insertPoint, neighborPointMatch } from './path-editor';
	import PathEditor from './PathEditor.svelte';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';
	import type { ShapeConfig } from '$lib/types';

	const getCurves = (crossSection: ShapeConfig) => {
		console.debug('getCurves', crossSection);
		return crossSection.curves;
	};
	let crossSection: ShapeConfig = $state($superConfigStore.subGlobuleConfigs[0].globuleConfig.shapeConfig);
	let curves = $derived(getCurves(crossSection));
</script>

<Editor>
	<section>
		<header>Silhouette</header>
		<Button onclick={() => console.log(crossSection)}>Print Silhouette</Button>
		<Container direction="row">
			<PathEditor
				curveDef={curves}
				onChangeCurveDef={(curveDef) => {
					const config = get(superConfigStore);
					config.subGlobuleConfigs[0].globuleConfig.shapeConfig.curves = curveDef;
					superConfigStore.set(config);
					crossSection = config.subGlobuleConfigs[0].globuleConfig.shapeConfig;
				}}
				config={{
					gutter: 300,
					padding: 100,
					contentBounds: { top: -100, left: -100, width: 200, height: 200 },
					size: { width: 400, height: 400 }
				}}
			>
				<circle cx="0" cy="0" r="3" stroke="black" stroke-width="0.25" fill="none" />
			</PathEditor>
			<Container direction="column">
				<LabeledControl label="Symmetry">
					<NumberInput
						onChange={(value) => {
							const config = get(superConfigStore);
							config.subGlobuleConfigs[0].globuleConfig.shapeConfig.symmetryNumber =
								value;
							superConfigStore.set(config);
							crossSection = config.subGlobuleConfigs[0].globuleConfig.shapeConfig;
						}}
						value={crossSection.symmetryNumber}
						min={1}
						max={99}
						step={1}
						hasButtons
					/>
				</LabeledControl>
			</Container>
		</Container>
	</section>
</Editor>

<style>
</style>
