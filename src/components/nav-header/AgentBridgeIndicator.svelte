<script lang="ts">
	import { agentBridgeActivity, agentBridgeEnabled } from '$lib/agent-bridge/enabled';

	// The bridge only exists on the dev server, so the switch is hidden elsewhere.
	const available = import.meta.env.DEV;

	let flashing = $state(false);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	let seen = $agentBridgeActivity;

	$effect(() => {
		if ($agentBridgeActivity === seen) return;
		seen = $agentBridgeActivity;
		flashing = true;
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flashing = false), 600);
	});
</script>

{#if available}
	<button
		class="agent-dot"
		class:on={$agentBridgeEnabled}
		class:flashing
		title={$agentBridgeEnabled
			? 'Claude control ON: Claude Code can read and change this design. Click to turn off.'
			: 'Claude control OFF. Click to let Claude Code drive this tab.'}
		aria-label={$agentBridgeEnabled ? 'Turn off Claude control' : 'Turn on Claude control'}
		aria-pressed={$agentBridgeEnabled}
		onclick={() => agentBridgeEnabled.set(!$agentBridgeEnabled)}
	></button>
{/if}

<style>
	.agent-dot {
		width: 14px;
		height: 14px;
		padding: 0;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.4);
		background-color: #d32f2f;
		cursor: pointer;
		flex: none;
	}
	.agent-dot.on {
		background-color: #2e7d32;
		box-shadow: 0 0 6px 1px rgba(76, 175, 80, 0.7);
	}
	.agent-dot.flashing {
		background-color: #a5d6a7;
		box-shadow: 0 0 12px 4px rgba(76, 175, 80, 0.9);
	}
</style>
