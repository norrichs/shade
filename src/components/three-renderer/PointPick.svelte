<script lang="ts">
	import { formatBandMap } from '$lib/recombination';
	import { superConfigStore } from '$lib/stores';
	import type {
		BandEnd,
		GeometryAddress,
		Recombination,
		RecombinatoryRecurrence
	} from '$lib/types';
	import { round } from '$lib/util';
	import {
		interactionMode as mode,
		interactions,
		type InteractionMode,
		type Interaction,
		isPointSelectInteractionMode,
		isBandSelectInteractionMode
	} from '../../components/three-renderer/interaction-mode';
	import Button from '../design-system/Button.svelte';

	const dynamicOverlay = (mode: InteractionMode) => {
		if (mode.type === 'point-select-translate') {
			const { pick, points } = mode.data;
			return `Pick point ${points.length + 1} of ${pick}`;
		}
	};
	let interaction: Interaction;

	const setRecombination = () => {
		if (
			$mode.type !== 'band-select-partners' ||
			$mode.data.originSelected?.address.b === undefined ||
			$mode.data.partnerSelected?.address.b === undefined
		) {
			return;
		}
		const {
			originSelected: { address: origin },
			partnerSelected: { address: partner }
		} = $mode.data;

		const recurrenceIndex = origin.g[origin.g.length - 1];

		const newRecurrences: RecombinatoryRecurrence[] =
			$superConfigStore.subGlobuleConfigs[origin.s].transforms[origin.g.length - 1].recurs;

		const newBandMapping = {
			originJoin: originJoin,
			partnerJoin: partnerJoin,
			originIndex: origin.b!,
			partnerAddress: { s: partner.s, g: partner.g, b: partner.b }
		};
		newRecurrences[recurrenceIndex].recombines = newRecurrences[recurrenceIndex].recombines ?? {
			bandMap: []
		};

		const existingMappingIndex = newRecurrences[recurrenceIndex].recombines.bandMap.findIndex(
			(bandMapping) => bandMapping.originIndex === newBandMapping.originIndex
		);

		if (existingMappingIndex >= 0) {
			const newBandMap = newRecurrences[recurrenceIndex].recombines!.bandMap;

			newBandMap.splice(existingMappingIndex, 1, newBandMapping);
			newRecurrences[recurrenceIndex].recombines = { bandMap: newBandMap };
		} else {
			const newBandMap = newRecurrences[recurrenceIndex].recombines.bandMap;

			newRecurrences[recurrenceIndex].recombines = { bandMap: [...newBandMap, newBandMapping] };
		}

		$superConfigStore.subGlobuleConfigs[origin.s].transforms[origin.g.length - 1].recurs =
			newRecurrences;

		$mode.data = { ...$mode.data, originSelected: undefined, partnerSelected: undefined };
	};

	const toggle = (bandEnd: BandEnd) => {
		return bandEnd === 'end' ? 'start' : 'end';
	};
	let partnerJoin: BandEnd = 'end';
	let originJoin: BandEnd = 'end';

	$: interaction = interactions[$mode.type];
</script>

<div class={`overlay ${$mode.type === 'standard' ? 'hide' : 'show'}`}>
	{#if isPointSelectInteractionMode($mode)}
		<div>{interaction.prompt}</div>
		<div>{$mode.data.points.length}</div>
		<div>
			{#each $mode.data.points as point}
				<div>{`(${round(point.x, 2)}, ${round(point.y)}, ${round(point.z)})`}</div>
			{/each}
		</div>
		<button on:click={$mode.onSelectPoint} disabled={$mode.data.points.length < $mode.data.pick}
			>{$mode.data.points.length < $mode.data.pick
				? interaction.buttonPrompt
				: interaction.buttonReady}</button
		>
	{:else if isBandSelectInteractionMode($mode)}
		<div>{interaction.prompt}</div>
		{#if $mode.type === 'band-select-partners' && $mode.data.originSelected && $mode.data.partnerSelected}
			<div>
				{`Origin: ${$mode.data.originSelected.address.g} ${$mode.data.originSelected.address.b}`}
				<Button on:click={() => (originJoin = toggle(originJoin))}>{originJoin}</Button>
			</div>
			<div>
				{`Partner: ${$mode.data.partnerSelected.address.g}, ${$mode.data.partnerSelected.address.b}`}
				<Button on:click={() => (partnerJoin = toggle(partnerJoin))}>{partnerJoin}</Button>
			</div>
			<div>
				<Button on:click={setRecombination}>OK</Button>
				<Button>Cancel</Button>
			</div>
		{/if}

		<!-- <div>{$mode.data.bands.length}</div>
		<div>
			{#each $mode.data.bands as band, i}
				<div>band {i}</div>
			{/each}
		</div>
		<button on:click={$mode.onSelectBands} disabled={$mode.data.bands.length < $mode.data.pick}>
			{$mode.data.bands.length < $mode.data.pick
				? interaction.buttonPrompt
				: interaction.buttonReady}
		</button> -->
	{/if}
</div>

<style>
	.overlay {
		position: absolute;
		top: 20%;
		left: 50%;
		padding: 30px;
		background-color: color(from var(--color-light) srgb r g b / 0.7);

		border-radius: 8px;
		visibility: hidden;
	}
	.overlay.show {
		visibility: visible;
	}
</style>
