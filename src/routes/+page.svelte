<script lang="ts">
	import { usePersisted } from '$lib/stores';
	import { getLocal } from '$lib/storage';

	let retrievedLocalUsePersisted;
	$: {
		retrievedLocalUsePersisted = getLocal('global-use-persisted')
			? getLocal('global-use-persisted')['global-use-persisted']
			: undefined;
	}
	// const sniffLocal = () => {
	//   console.debug(localStorage)
	// }
	// sniffLocal()
</script>

<h1>Welcome</h1>
<p><a href="/shades">Rotated Shape</a></p>
<div>
	<label for="use-persisted-checkbox">persist settings?</label>
	<input type="checkbox" bind:checked={$usePersisted} />
</div>
