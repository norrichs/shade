<script lang="ts">
	import type { Snippet } from 'svelte';
	import NavHeader from '../components/nav-header/NavHeader.svelte';
	import './theme.css';

	let { children }: { children: Snippet } = $props();
</script>

<NavHeader />
{@render children()}

<style>
	:global(body) {
		margin: 0;
	}
</style>
