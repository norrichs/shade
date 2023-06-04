<script lang="ts">
  import {usePersisted} from "../lib/stores"
  import {getLocal} from "../lib/storage"

  let retrievedLocalUsePersisted;
  $: {
    retrievedLocalUsePersisted = getLocal("global-use-persisted") ? getLocal("global-use-persisted")["global-use-persisted"] : undefined
  }
  // const sniffLocal = () => {
  //   console.debug(localStorage)
  // }
  // sniffLocal()

</script>


<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>
<p><a href="/rotated-shape">Rotated Shape</a></p>
<div>
  <label for="use-persisted-checkbox">persist settings?</label>
  <input type="checkbox" bind:checked={$usePersisted} />
</div>
