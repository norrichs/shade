<script lang="ts">
	import NavHeader from '../components/nav-header/NavHeader.svelte';
	import './theme.css';
</script>

<NavHeader />
<slot />


<style>
	:global(body) {
		margin: 0;
	}
</style>
