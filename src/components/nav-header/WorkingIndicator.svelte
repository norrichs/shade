<script lang="ts">
	import { isGenerating } from '$lib/stores';
</script>

{#if $isGenerating}
	<div class="working-indicator">
		<span class="dots">...working</span>
	</div>
{/if}

<style>
	.working-indicator {
		display: flex;
		align-items: center;
		padding: 0 12px;
		color: var(--color-text-muted, #ccc);
		font-size: 0.9rem;
		font-style: italic;
	}

	.dots {
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 1;
		}
	}
</style>
