<script lang="ts">
	import { usePersisted } from '$lib/stores';
</script>

<h1>Welcome</h1>
<p><a href="/shades">Shade Designer</a></p>
<p><a href="/gallery">Gallery</a></p>
<p><a href="/sandbox-ellipse-intersections">Sandbox - Ellipse Intersections</a></p>
<p><a href="/sandbox-line-intersections">Sandbox - Line Intersections</a></p>
<p><a href="/sandbox-box-pattern">Sandbox - Box Pattern</a></p>
<p><a href="/sandbox-bezier-intersections">Sandbox - Bezier Intersections</a></p>
<p><a href="/sandbox-scaled-svg">Sandbox - Scaled SVG</a></p>
<p><a href="/sandbox-patterns">Sandbox - Patterns</a></p>
<p><a href="/sandbox-svg-display">Sandbox - SVG Display</a></p>
<p><a href="/sandbox-server-test">Server Test</a></p>

<div>
	<label for="use-persisted-checkbox">persist settings?</label>
	<input type="checkbox" bind:checked={$usePersisted} />
</div>
