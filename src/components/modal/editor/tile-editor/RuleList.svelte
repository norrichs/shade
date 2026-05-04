<script lang="ts">
	import type { IndexPair } from '$lib/patterns/spec-types';

	let {
		rules,
		onDelete,
		sourceColor,
		targetColor
	}: {
		rules: IndexPair[];
		onDelete: (index: number) => void;
		sourceColor?: string;
		targetColor?: string;
	} = $props();
</script>

<div class="rule-list">
	<div class="header">Rules ({rules.length})</div>
	{#if rules.length === 0}
		<div class="empty">No rules in this mode.</div>
	{:else}
		<ul>
			{#each rules as rule, i (i + ':' + rule.source + ':' + rule.target)}
				<li>
					<code>
						<span style:color={sourceColor ?? 'inherit'}>{rule.source}</span>
						<span class="arrow">→</span>
						<span style:color={targetColor ?? 'inherit'}>{rule.target}</span>
					</code>
					<button onclick={() => onDelete(i)}>×</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.rule-list {
		flex: 0 0 200px;
		padding: 8px;
		border-left: 1px dotted black;
	}
	.header {
		font-weight: bold;
		margin-bottom: 4px;
	}
	.empty {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.85em;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 400px;
		overflow-y: auto;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.85em;
		padding: 2px 4px;
	}
	code {
		font-weight: bold;
	}
	.arrow {
		color: rgba(0, 0, 0, 0.5);
		margin: 0 2px;
		font-weight: normal;
	}
	li:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}
	button {
		background: none;
		border: none;
		color: rgba(0, 0, 0, 0.5);
		cursor: pointer;
		font-weight: bold;
	}
	button:hover {
		color: red;
	}
</style>
