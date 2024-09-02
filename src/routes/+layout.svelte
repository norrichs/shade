<script lang="ts">
	import NavHeader from '../components/nav-header/NavHeader.svelte';
</script>

<NavHeader />

<slot />

<style>
	:global(body) {
		margin: 0;
	}
</style>
