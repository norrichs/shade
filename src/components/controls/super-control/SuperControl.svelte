<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import { isGlobuleTransformRotate, isGlobuleTransformTranslate } from '$lib/transform-globule';
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
	<div>
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
						{/if}
					</TransformCard>
				{/each}
			</SubGlobuleCard>
		{/each}
	</div>
</section>
