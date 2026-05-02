<script lang="ts">
	import type { Snippet } from 'svelte';
	import NavHeader from '../components/nav-header/NavHeader.svelte';
	import './theme.css';
	import { tilePatternSpecStore } from '$lib/stores/tilePatternSpecStore';

	let { children }: { children: Snippet } = $props();

	$effect(() => {
		tilePatternSpecStore.hydrate();
	});
</script>

<NavHeader />
{@render children()}

<style>
	:global(body) {
		margin: 0;
	}
</style>
