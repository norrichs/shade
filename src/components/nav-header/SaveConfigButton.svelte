<script lang="ts">
	import { superConfigStore } from '$lib/stores';
	import Button from '../design-system/Button.svelte';
	import { isModified, isSaved } from './save-config';

	

	const handleSave = async () => {
		const response = await fetch('/api/superGlobuleConfig', {
			method: 'POST',
			body: JSON.stringify({ ...$superConfigStore }),
			headers: { 'content-type': 'application/json' }
		});
		const result = await response.json();
		console.debug('SAVE', {result});
	};
</script>

<Button on:click={handleSave}>{isSaved($superConfigStore) ? "Save" : "New Save"}</Button>
