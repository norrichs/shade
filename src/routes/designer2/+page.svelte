<script lang="ts">
	// @ts-expect-error -- the package's "exports" map hides its bundled .d.ts
	import { asDraggable } from 'svelte-drag-and-drop-actions';
	import ThreeRenderer from '../../components/three-renderer/ThreeRenderer.svelte';
	import PatternViewer from '../../components/cut-pattern/PatternViewer.svelte';
	import Scene from '../../components/three-renderer/Scene.svelte';
	import {
		computationMode,
		designerPanels,
		clampSplit,
		MIN_PANEL_FRACTION,
		type PanelLayout
	} from '$lib/stores/uiStores';
	import HoverSidebar from '../../components/modal/HoverSidebar.svelte';
	import { projectionConfigs } from '../../components/modal/sidebar-definitions';
	import Toast from '../../components/Toast.svelte';
	import { installAgentBridge } from '$lib/agent-bridge/client';

	// Dev-only: lets Claude Code drive this page when the navbar dot is green.
	$effect(() => installAgentBridge());

	let main: HTMLElement | undefined = $state();
	let dragging = $state(false);
	/** Pointer height within the divider, so the grip sits under the cursor. */
	let handleY = $state(0);

	const showPatternPane = $derived($computationMode !== '3d-only');
	// With the pattern pane unmounted, any layout that wants it collapses to the model alone.
	const layout: PanelLayout = $derived(showPatternPane ? $designerPanels.layout : 'model');
	const split = $derived(clampSplit($designerPanels.split));
	const isSplit = $derived(layout === 'model-pattern' || layout === 'pattern-model');

	// Panes stay mounted and are hidden with CSS so switching layouts keeps the camera
	// and pattern state; `order` swaps sides without a remount.
	const modelWidth = $derived(
		layout === 'model-pattern' ? split : layout === 'pattern-model' ? 1 - split : 1
	);
	const patternWidth = $derived(isSplit ? 1 - modelWidth : 1);

	const setSplit = (x: number) => {
		if (!main) return;
		$designerPanels = { ...$designerPanels, split: clampSplit(x / main.clientWidth) };
	};
</script>

<main bind:this={main}>
	<Toast />
	<section
		class="container"
		class:hidden={layout === 'pattern'}
		style:order={layout === 'pattern-model' ? 2 : 0}
		style:width={`calc(${modelWidth} * 100vw)`}
	>
		<ThreeRenderer>
			<Scene />
		</ThreeRenderer>
	</section>
	{#if showPatternPane}
		<section
			class="container"
			class:hidden={layout === 'model'}
			style:order={1}
			style:width={`calc(${patternWidth} * 100vw)`}
		>
			<PatternViewer />
		</section>
	{/if}
	{#if isSplit}
		<div
			class="divider"
			class:dragging
			style:left={`calc(${split} * 100%)`}
			role="separator"
			aria-orientation="vertical"
			aria-valuemin={MIN_PANEL_FRACTION * 100}
			aria-valuemax={(1 - MIN_PANEL_FRACTION) * 100}
			aria-valuenow={Math.round(split * 100)}
			onpointermove={(ev: PointerEvent & { currentTarget: EventTarget & HTMLDivElement }) => {
				if (!dragging) handleY = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
			}}
			use:asDraggable={{
				relativeTo: 'parent',
				Dummy: 'none',
				onDragStart: () => {
					dragging = true;
					return { x: split * (main?.clientWidth ?? 0), y: handleY };
				},
				onDragMove: (x: number, y: number) => {
					setSplit(x);
					handleY = y;
				},
				onDragEnd: (x: number, y: number) => {
					setSplit(x);
					handleY = y;
					dragging = false;
				}
			}}
		>
			<div class="handle" style:top={`${handleY}px`}></div>
		</div>
	{/if}
	<HoverSidebar sidebarDefinition={projectionConfigs} />
</main>

<style>
	main {
		--designer-height: calc(100vh - var(--nav-header-height));
		--divider-hit-width: 20px;
		position: relative;
		height: var(--designer-height);
		width: 100vw;
		display: flex;
		flex-direction: row;
	}
	section.container {
		box-sizing: border-box;
		height: var(--designer-height);
		flex: none;
		border: 1px solid gray;
	}
	section.container.hidden {
		display: none;
	}

	.divider {
		position: absolute;
		top: 0;
		bottom: 0;
		width: var(--divider-hit-width);
		transform: translateX(-50%);
		z-index: 10;
		cursor: col-resize;
	}
	.handle {
		position: absolute;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 9px;
		height: 48px;
		border-radius: 4.5px;
		background: #555;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
		opacity: 0;
		transition: opacity 120ms;
	}
	.divider::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 2px;
		transform: translateX(-50%);
		background: #555;
		opacity: 0;
		transition: opacity 120ms;
	}
	.divider:hover .handle,
	.divider.dragging .handle,
	.divider:hover::before,
	.divider.dragging::before {
		opacity: 1;
	}
</style>
