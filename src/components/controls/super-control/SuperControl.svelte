<script lang="ts">
	import { selectedBand, superConfigStore, type ActiveGeometryAddress } from '$lib/stores';
	import {
		isGlobuleTransformReflect,
		isGlobuleTransformRotate,
		isGlobuleTransformScale,
		isGlobuleTransformTranslate
	} from '$lib/transform-globule';
	import TextInput from '../../design-system/TextInput.svelte';
	import ReflectCard from './ReflectCard.svelte';
	import RotateCard from './RotateCard.svelte';
	import ScaleCard from './ScaleCard.svelte';
	import SubGlobuleCard from './SubGlobuleCard.svelte';
	import TransformCard from './TransformCard.svelte';
	import TranslateCard from './TranslateCard.svelte';

	const isActive = (selected: ActiveGeometryAddress, sg: number, t?: number) => {
		if (t === undefined) {
			return selected.s === sg;
		}
		return selected.s === sg && selected.g.length === t + 1;
	};
</script>

<section class="scroll-container">
	<header>
		<TextInput bind:value={$superConfigStore.name} />
	</header>

	{#each $superConfigStore.subGlobuleConfigs as subGlobuleConfig, sgIndex}
		<SubGlobuleCard {sgIndex} active={isActive($selectedBand, sgIndex)}>
			{#each subGlobuleConfig.transforms as transform, tIndex}
				<TransformCard {transform} {tIndex} {sgIndex}>
					{#if isGlobuleTransformRotate(transform)}
						<RotateCard {sgIndex} {tIndex} active={isActive($selectedBand, sgIndex, tIndex)} />
					{:else if isGlobuleTransformTranslate(transform)}
						<TranslateCard {sgIndex} {tIndex} active={isActive($selectedBand, sgIndex, tIndex)} />
					{:else if isGlobuleTransformReflect(transform)}
						<ReflectCard {sgIndex} {tIndex} active={isActive($selectedBand, sgIndex, tIndex)} />
					{:else if isGlobuleTransformScale(transform)}
						<ScaleCard {sgIndex} {tIndex} active={isActive($selectedBand, sgIndex, tIndex)} />
					{/if}
				</TransformCard>
			{/each}
		</SubGlobuleCard>
	{/each}
</section>

<style>
	header {
		padding: 4px;
	}
	section {
		width: 100%;
		height: calc(50vh - var(--nav-header-height) / 2 - 33.5px);
	}
	.scroll-container {
		padding-left: 12px;
		/* height: 100%; */
		overflow-y: scroll;
		overflow-x: visible;
	}
</style>
