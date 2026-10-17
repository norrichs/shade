<script lang="ts">
	import {
		interactionMode as mode,
		interactions,
		type Interaction,
		isBandSelectInteractionMode
	} from '../../components/three-renderer/interaction-mode';

	let interaction: Interaction = $derived(interactions[$mode.type]);

	// Measure and quad-split modes have no content here, so only band-select shows
	// the overlay; showing it for them would leave an empty, click-blocking box
	// over the viewport.
	let showOverlay = $derived(isBandSelectInteractionMode($mode));
</script>

<div class={`overlay ${showOverlay ? 'show' : 'hide'}`}>
	{#if isBandSelectInteractionMode($mode)}
		<div>{interaction.prompt}</div>
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
