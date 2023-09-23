<script lang="ts">
	import { usePersisted } from '$lib/stores';
</script>

<h1>Welcome</h1>
<p><a href="/shades">Shade Designer</a></p>
<!-- <p><a href="/sandbox">Sandbox1</a></p>
<p><a href="/sandbox2">Sandbox2</a></p>
<p><a href="/sandbox3">Sandbox3</a></p> -->
<div>
	<label for="use-persisted-checkbox">persist settings?</label>
	<input type="checkbox" bind:checked={$usePersisted} />
</div>
