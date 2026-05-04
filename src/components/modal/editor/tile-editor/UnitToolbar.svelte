<script lang="ts">
	import type { Group } from '../vertex-topology';

	export type UnitTool = 'drag' | 'add' | 'remove' | 'skipRemove';

	let {
		tool,
		group,
		onChangeTool,
		onChangeGroup
	}: {
		tool: UnitTool;
		group: Group;
		onChangeTool: (tool: UnitTool) => void;
		onChangeGroup: (group: Group) => void;
	} = $props();

	const tools: { id: UnitTool; label: string }[] = [
		{ id: 'drag', label: 'Drag' },
		{ id: 'add', label: 'Add' },
		{ id: 'remove', label: 'Remove' },
		{ id: 'skipRemove', label: 'Skip Remove' }
	];
	const groups: Group[] = ['start', 'middle', 'end'];
</script>

<div class="toolbar">
	<div class="tools">
		{#each tools as t (t.id)}
			<button class:active={tool === t.id} onclick={() => onChangeTool(t.id)}>{t.label}</button>
		{/each}
	</div>
	{#if tool === 'add'}
		<div class="groups">
			<span class="label">Group:</span>
			{#each groups as g (g)}
				<label>
					<input
						type="radio"
						name="vertex-group"
						checked={group === g}
						onchange={() => onChangeGroup(g)}
					/>
					{g}
				</label>
			{/each}
		</div>
	{/if}
</div>

<style>
	.toolbar {
		display: flex;
		flex-direction: row;
		gap: 12px;
		padding: 4px 8px;
		border-bottom: 1px dotted black;
	}
	.tools,
	.groups {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	button.active {
		font-weight: bold;
		text-decoration: underline;
	}
	.label {
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.85em;
	}
</style>
