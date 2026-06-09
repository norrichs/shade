<script lang="ts">
	import {
		selectedBandLogInfo,
		clearBandSelectionLog,
		recordBandSelection,
		selectModeActive
	} from '$lib/stores';
	import { formatBandAddress } from '$lib/cut-pattern/band-partner-info';

	// Floating readout of bands clicked in the 3D view. For each band it shows the
	// end-connection partners read straight from the 3D facet meta graph, so a
	// ring picked by eye can be checked against the partner data. Mounted OUTSIDE
	// the <Canvas> so its DOM actually renders (Scene's own DOM does not).

	let collapsed = $state(false);
</script>

<div class="panel" class:collapsed>
	<header>
		<button class="toggle" onclick={() => (collapsed = !collapsed)}>
			{collapsed ? '▸' : '▾'} Selected bands ({$selectedBandLogInfo.length})
		</button>
		{#if $selectedBandLogInfo.length > 0}
			<button class="clear" onclick={clearBandSelectionLog}>clear</button>
		{/if}
	</header>

	{#if !collapsed}
		<div class="dropdown">
			<button
				class="select-mode"
				class:active={$selectModeActive}
				onclick={() => selectModeActive.update((v) => !v)}
			>
				{$selectModeActive
					? '● select mode ON — camera locked'
					: '○ select mode OFF — camera free'}
			</button>

			{#if $selectedBandLogInfo.length === 0}
				<p class="empty">Click bands in the 3D view to inspect their end connections.</p>
			{:else}
				<ul>
				{#each $selectedBandLogInfo as item (item.source + '-' + item.address.tube + '-' + item.address.band)}
					<li>
						<div class="row">
							<span class="addr">{formatBandAddress(item.address)}</span>
							<span class="source">{item.source}</span>
							<button
								class="remove"
								title="remove"
								onclick={() => recordBandSelection(item.source, { ...item.address, facet: 0 })}
								>×</button
							>
						</div>
						<div class="partners">
							<span class="end-label">start →</span>
							{#if item.info.startPartners.length}
								{item.info.startPartners.map(formatBandAddress).join(', ')}
							{:else}
								<span class="none">none (boundary)</span>
							{/if}
						</div>
						<div class="partners">
							<span class="end-label">end →</span>
							{#if item.info.endPartners.length}
								{item.info.endPartners.map(formatBandAddress).join(', ')}
							{:else}
								<span class="none">none (boundary)</span>
							{/if}
						</div>
						{#if !item.info.found}
							<div class="warn">band not found in {item.source} tubes</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		</div>
	{/if}
</div>

<style>
	.panel {
		position: relative;
		display: inline-block;
		font-size: 12px;
		font-family: monospace;
	}
	.dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 20;
		width: 260px;
		max-height: 70vh;
		overflow-y: auto;
		background: rgba(255, 255, 255, 0.97);
		border: 1px solid #999;
		border-radius: 4px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
	}
	header {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.toggle {
		border: 1px solid #bbb;
		background: #f4f4f4;
		cursor: pointer;
		font: inherit;
		font-weight: bold;
		border-radius: 3px;
		padding: 4px 8px;
		white-space: nowrap;
	}
	.clear,
	.remove {
		border: 1px solid #bbb;
		background: #f4f4f4;
		cursor: pointer;
		font: inherit;
		border-radius: 3px;
		padding: 0 4px;
		line-height: 1.4;
	}
	.select-mode {
		display: block;
		width: calc(100% - 12px);
		margin: 6px;
		padding: 5px 6px;
		border: 1px solid #bbb;
		border-radius: 3px;
		background: #f4f4f4;
		cursor: pointer;
		font: inherit;
		text-align: left;
	}
	.select-mode.active {
		background: #2c7;
		border-color: #1a5;
		color: #fff;
		font-weight: bold;
	}
	.empty {
		margin: 0;
		padding: 8px;
		color: #666;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 4px;
	}
	li {
		padding: 4px 6px;
		border-bottom: 1px dotted #ddd;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.addr {
		font-weight: bold;
	}
	.source {
		color: #888;
		font-size: 10px;
		margin-left: auto;
	}
	.partners {
		margin-left: 8px;
		color: #333;
	}
	.end-label {
		color: #888;
		display: inline-block;
		width: 44px;
	}
	.none {
		color: #aa6;
	}
	.warn {
		color: #c33;
		margin-left: 8px;
	}
</style>
