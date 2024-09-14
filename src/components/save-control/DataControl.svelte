<script lang="ts">
	import { AUTO_PERSIST_KEY } from '$lib/persistable';
	import { configStore } from '$lib/stores/stores';

	const handleSave = async () => {
		if (!$configStore.id || $configStore.id === AUTO_PERSIST_KEY) {
			console.debug('POST');
			const response = await fetch('/api/globuleConfig', {
				method: 'POST',
				body: JSON.stringify({ ...$configStore }),
				headers: { 'content-type': 'application/json' }
			});
			const result = await response.json();
			console.debug('POST result', result);
			return result;
		}
		console.debug('PUT');
		const response = await fetch(`/api/globuleConfig/${$configStore.id}`, {
			method: 'PUT',
			body: JSON.stringify({ ...$configStore }),
			headers: { 'content-type': 'application/json' }
		});
		console.debug('PUT response', response);
		const result = await response.json();
		console.debug('PUT result', result);
		return result;
	};
</script>

<section>
	<div>Data</div>
	<!-- svelte-ignore a11y-label-has-associated-control -->
	<label>Name</label>
	<input type="text" bind:value={$configStore.name} />

	<button on:click={handleSave}>Save To DB</button>
</section>

<style>
	section {
		padding: 30px;
	}
</style>
