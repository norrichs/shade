<script lang="ts">
	import { usePersisted } from '$lib/stores';
</script>

<h1>Welcome</h1>
<p><a href="/shades">Shade Designer</a></p>
<div>
	<label for="use-persisted-checkbox">persist settings?</label>
	<input type="checkbox" bind:checked={$usePersisted} />
</div>
