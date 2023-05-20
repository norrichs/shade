<script lang="ts">
	import type { RotatedShapeGeometryConfig } from '$lib/rotated-shape';
  import {setLocal, getLocal, resetLocal, AUTO_PERSIST_KEY} from "../../lib/storage"
  import {spreadConfigToStores, resetStore} from "../../lib/stores"

	export let show = false;
	export let config: RotatedShapeGeometryConfig;
	export let update: () => void;

  let test: string | null;

	let persistLocalStorage = true;
  let storageKey = "test_storage"

</script>

<section class:show>
	<header><h3>Data settings</h3><p>
    {test}
  </p></header>
	<div class="column">
		<div class="row">
			<label for="persistent">Persist</label>
			<input type="checkbox" bind:checked={persistLocalStorage} />
			<button on:click={() => {
				resetLocal(AUTO_PERSIST_KEY)
				resetStore()
				console.debug("value after reset", config.shapeConfig)
				update()
				
				}}>Reset</button>
      <button on:click={()=>setLocal(storageKey, config)}>Save</button>
      <button on:click={() => {
        const retrieved = getLocal(storageKey)
        spreadConfigToStores(retrieved);
      }}>Retrieve</button>
			<!-- <button on:click={()=>test = resetToDefault(test)}>Reset</button> -->
		</div>
	</div>
</section>

<style>
	section {
		display: none;
		padding: 30px;
	}
	.show {
		display: flex;
		flex-direction: column;
	}
	.column {
		display: flex;
		flex-direction: column;
	}
	.row {
		display: flex;
		flex-direction: row;
		gap: 30px;
	}
</style>
