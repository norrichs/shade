<!-- src/routes/sandbox-paper-worker/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';

	let result = 'pending';

	onMount(() => {
		const worker = new Worker(new URL('$lib/workers/paper-probe.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onmessage = (event) => {
			result = JSON.stringify(event.data);
			worker.terminate();
		};
		worker.onerror = (event) => {
			result = JSON.stringify({ ok: false, error: event.message });
			worker.terminate();
		};
		worker.postMessage({ type: 'probe' });
	});
</script>

<h1>paper-in-worker probe</h1>
<pre data-testid="probe-result">{result}</pre>
