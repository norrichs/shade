<script lang="ts">
	/**
	 * Renders, as a tabular grid, the exact CSV data that the pattern export
	 * (`buildPatternCsv`) produces. The parent computes the CSV string and passes
	 * it in; here we parse it (RFC 4180 aware) and render rows/cells. The first
	 * row is treated as the header. Body rows may have more cells than the header
	 * (e.g. end-connection mode lists variable members), so the grid is a plain
	 * table rather than a fixed-column CSS grid.
	 */
	let { csv = '' }: { csv?: string } = $props();

	/** Minimal RFC 4180 parser matching `csvCell`'s quoting in build-pattern-csv. */
	const parseCsv = (text: string): string[][] => {
		const rows: string[][] = [];
		let row: string[] = [];
		let field = '';
		let inQuotes = false;

		for (let i = 0; i < text.length; i++) {
			const c = text[i];
			if (inQuotes) {
				if (c === '"') {
					if (text[i + 1] === '"') {
						field += '"';
						i++;
					} else {
						inQuotes = false;
					}
				} else {
					field += c;
				}
			} else if (c === '"') {
				inQuotes = true;
			} else if (c === ',') {
				row.push(field);
				field = '';
			} else if (c === '\n') {
				row.push(field);
				rows.push(row);
				row = [];
				field = '';
			} else if (c !== '\r') {
				field += c;
			}
		}
		row.push(field);
		rows.push(row);
		return rows;
	};

	let rows = $derived(csv.trim() ? parseCsv(csv) : []);
	let header = $derived(rows[0] ?? []);
	let body = $derived(rows.slice(1));
</script>

<div class="pattern-data">
	{#if body.length === 0}
		<p class="empty">No pattern data available.</p>
	{:else}
		<table>
			<thead>
				<tr>
					{#each header as cell, i (i)}
						<th>{cell}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each body as dataRow, r (r)}
					<tr>
						{#each dataRow as cell, c (c)}
							<td>{cell}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.pattern-data {
		width: 100%;
		height: 100%;
		overflow: auto;
		font-size: 0.8rem;
	}
	.empty {
		padding: 1rem;
		color: gray;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		border: 1px solid #ddd;
		padding: 0.25rem 0.5rem;
		text-align: left;
		white-space: nowrap;
	}
	thead th {
		position: sticky;
		top: 0;
		background-color: #f4f4f4;
		font-weight: 600;
		z-index: 1;
	}
	tbody tr:nth-child(even) {
		background-color: #fafafa;
	}
</style>
