<script lang="ts">
	import type { IndexPair } from '$lib/patterns/spec-types';
	import RuleList from './RuleList.svelte';
	import type { RuleSetKey } from './partner-neighbors';

	let {
		withinBand,
		acrossBands,
		partnerStartEnd,
		partnerEndEnd,
		onDelete
	}: {
		withinBand: IndexPair[];
		acrossBands: IndexPair[];
		partnerStartEnd: IndexPair[];
		partnerEndEnd: IndexPair[];
		onDelete: (ruleSet: RuleSetKey, index: number) => void;
	} = $props();
</script>

<div class="rules-panel">
	<div class="section">
		<div class="section-title" style:color="rgb(120, 80, 30)">Within Band</div>
		<RuleList
			rules={withinBand}
			onDelete={(i) => onDelete('withinBand', i)}
			sourceColor="rgb(120, 80, 30)"
			targetColor="rgb(80, 130, 200)"
		/>
	</div>
	<div class="section">
		<div class="section-title" style:color="rgb(60, 60, 60)">Across Bands</div>
		<RuleList
			rules={acrossBands}
			onDelete={(i) => onDelete('acrossBands', i)}
			sourceColor="rgb(60, 60, 60)"
			targetColor="rgb(80, 130, 200)"
		/>
	</div>
	<div class="section">
		<div class="section-title" style:color="rgb(180, 0, 0)">Partner Start</div>
		<RuleList
			rules={partnerStartEnd}
			onDelete={(i) => onDelete('partner.startEnd', i)}
			sourceColor="rgb(180, 0, 0)"
			targetColor="rgb(80, 130, 200)"
		/>
	</div>
	<div class="section">
		<div class="section-title" style:color="rgb(0, 140, 0)">Partner End</div>
		<RuleList
			rules={partnerEndEnd}
			onDelete={(i) => onDelete('partner.endEnd', i)}
			sourceColor="rgb(0, 140, 0)"
			targetColor="rgb(80, 130, 200)"
		/>
	</div>
</div>

<style>
	.rules-panel {
		flex: 0 0 220px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		border-left: 1px dotted black;
	}
	.section-title {
		font-weight: bold;
		font-size: 0.85em;
		margin-bottom: 2px;
	}
</style>
