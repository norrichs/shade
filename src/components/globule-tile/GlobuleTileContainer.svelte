<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { FiChevronDown, FiChevronUp } from 'svelte-icons-pack/fi';
	import type { Id } from '$lib/types';
	export let name: string;
	export let id: Id;
	export let size;

	let showOverlay = false;
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="globule-container" style={`--size: ${size}px`}>
	<div class="overlay" on:mouseleave={() => (showOverlay = false)}>
		<div>
			<header
				on:mouseenter={() => {
					showOverlay = true;
				}}
			>
				<div>
					{`id: ${id}, ${name}`}
					<!-- {name ? name : `id: ${id}`} -->
				</div>
				<Icon src={showOverlay ? FiChevronUp : FiChevronDown} />
			</header>
			<section>
				<slot />
			</section>
		</div>
	</div>
	<slot name="globule-tile-3d" />
</div>

<style>
	.globule-container {
		width: var(--size, --size-tile-medium);
		height: var(--size, --size-tile-medium);
		border-radius: 4px;
		border: 1px solid var(--color-light);
		box-shadow: 2px 2px 10px 2px rgba(0, 0, 0, 0.2);
		position: relative;
	}

	.overlay {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		background-color: transparent;
		overflow-y: hidden;
		bottom: calc(var(--size, --size-tile-medium) - 27px);
		transition: 200ms;
	}
	.overlay header {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		padding: 4px;
		background-color: var(--color-shaded-light);
	}
	.overlay:hover {
		background-color: var(--color-shaded-medium);
		bottom: 0;
		transition: 400ms;
	}
	.overlay:hover header {
		box-shadow: 0 0 4px 0px var(--color-black);
		background-color: var(--color-black);
		color: white;
		transition: 400ms;
	}
	.overlay section {
		display: flex;
		flex-direction: column;
		padding: 8px;
		gap: 4px;
	}
</style>
