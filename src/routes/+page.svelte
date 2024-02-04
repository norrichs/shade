<script lang="ts">
	import { usePersisted } from '$lib/stores';
</script>

<h1>Welcome</h1>
<p><a href="/shades">Shade Designer</a></p>
<p><a href="/sandbox4">Sandbox4</a></p>
<p><a href="/sandbox5">Sandbox5</a></p>
<p><a href="/sandbox6">Sandbox6</a></p>
<p><a href="/sandbox7">Sandbox7</a></p>
<div>
	<label for="use-persisted-checkbox">persist settings?</label>
	<input type="checkbox" bind:checked={$usePersisted} />
</div>
