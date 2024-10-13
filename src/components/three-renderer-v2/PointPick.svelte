<script lang="ts">
	import { round } from '$lib/util';
	import {
		interactionMode as mode,
		interactions,
		type InteractionMode,
		type Interaction
	} from '../../components/three-renderer-v2/interaction-mode';

	const dynamicOverlay = (mode: InteractionMode) => {
		if (mode.type === 'point-select-translate') {
			const { pick, points } = mode.data;
			return `Pick point ${points.length + 1} of ${pick}`;
		}
	};
	let interaction: Interaction;

	$: interaction = interactions[$mode.type];
</script>

<div class={`overlay ${$mode.type === 'standard' ? 'hide' : 'show'}`}>
	{#if $mode.type !== 'standard'}
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
