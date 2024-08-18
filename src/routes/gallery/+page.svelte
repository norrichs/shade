<script lang="ts">
	import type { Level, Band, Strut } from '$lib/types';
	import Globule from '../../components/globule/Globule.svelte';
	import { data } from '../../components/globule/seed';
</script>

<main>
	<header>
		<h1>Gallery</h1>
	</header>
	<section>
		<div>
			{#each data as globule}
				<Globule name={globule.name} data={globule.data} />
			{/each}
		</div>
	</section>
</main>
