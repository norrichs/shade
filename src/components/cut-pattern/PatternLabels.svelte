<script lang="ts">
	let { values = [], offsetBy = { x: 0, y: 0 } }: { values?: number[]; offsetBy?: { x: number; y: number } } =
		$props();

	type PathSegmentCharacter = 'M' | 'A' | 'Z' | 'L' | 'Q' | 'C';

	const isPathSegmentCharacter = (
		str: string | PathSegmentCharacter
	): str is PathSegmentCharacter => ['M', 'A', 'Z', 'L', 'Q', 'C'].includes(str);
</script>

{#each values as value, i}
	<g fill="red">
		<path
			d={geLabelPath(value, { r: 10, offset: { x: offsetBy.x * i, y: offsetBy.y * i } })}
			fill-rule="evenodd"
		/>
	</g>
{/each}

<style>
	.small {
		line-height: 20px;
		font: san-serif;
		font-weight: 900;
	}
</style>
