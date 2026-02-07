<script lang="ts">
	import { shouldUsePersisted } from '$lib/stores/stores';
</script>

<p><a href="/shades">Shade Designer</a></p>

<div>
	<label for="use-persisted-checkbox">persist settings?</label>
	<input type="checkbox" bind:checked={$shouldUsePersisted} />
</div>
