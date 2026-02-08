<script lang="ts">
	import { logger } from './logger';
</script>

{#if $logger}
	<div class="logger-config">
		<span>logger</span>
		<input type="checkbox" bind:checked={$logger.config.show} />
		<input type="number" max="1" min="0" step="0.1" bind:value={$logger.config.opacity} />
		<input type="number" max="5" min="0" step="0.1" bind:value={$logger.config.strokeWidth} />
	</div>
{/if}
