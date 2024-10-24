<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import {
		isGlobuleTransformReflect,
		isGlobuleTransformRotate,
		isGlobuleTransformTranslate
	} from '$lib/transform-globule';
	import ReflectCard from './ReflectCard.svelte';
	import RotateCard from './RotateCard.svelte';
	import SubGlobuleCard from './SubGlobuleCard.svelte';
	import TransformCard from './TransformCard.svelte';
	import TranslateCard from './TranslateCard.svelte';
	import { activeControl } from './active-control';

	console.debug('SUPERCONTROL', { $superConfigStore });
	const isActive = (sgIndex: number, tIndex: number) => {
		return $activeControl?.sgIndex === sgIndex && $activeControl?.tIndex === tIndex;
	};
</script>

<section>
	<header>
		<div>{$superConfigStore.name}</div>
	</header>
	<div>{$superConfigStore.subGlobuleConfigs.length}</div>
	<div class="scroll-container">
		{#each $superConfigStore.subGlobuleConfigs as subGlobuleConfig, sgIndex}
			<SubGlobuleCard {sgIndex}>
				{#each subGlobuleConfig.transforms as transform, tIndex}
					<TransformCard {transform} {tIndex} {sgIndex}>
						{#if isGlobuleTransformRotate(transform)}
							<RotateCard
								{sgIndex}
								{tIndex}
								active={$activeControl?.sgIndex === sgIndex && $activeControl?.tIndex === tIndex}
							/>
						{:else if isGlobuleTransformTranslate(transform)}
							<TranslateCard
								{sgIndex}
								{tIndex}
								active={$activeControl?.sgIndex === sgIndex && $activeControl?.tIndex === tIndex}
							/>
						{:else if isGlobuleTransformReflect(transform)}
							<ReflectCard
								{sgIndex}
								{tIndex}
								active={$activeControl?.sgIndex === sgIndex && $activeControl?.tIndex === tIndex}
							/>
						{/if}
					</TransformCard>
				{/each}
			</SubGlobuleCard>
		{/each}
	</div>
</section>

<style>
	section {
		width: 100%;
		background-color: red;
	}
	.scroll-container {
		background-color: aliceblue;
		height: 50vh;
		overflow-y: scroll;
		overflow-x: visible;
	}
</style>
