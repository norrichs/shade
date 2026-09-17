<script lang="ts">
	/**
	 * Renders, as a tabular grid, the exact CSV data that the pattern export
	 * (`buildPatternCsv`) produces. The parent computes the CSV string and passes
	 * it in; here we parse it (RFC 4180 aware) and render rows/cells. The first
	 * row is treated as the header. Body rows may have more cells than the header
	 * (e.g. end-connection mode lists variable members), so the grid is a plain
	 * table rather than a fixed-column CSS grid.
	 *
	 * A filter bar above the grid narrows rows by Ring, Partner Ring, and Tube #:
	 *   - Ring: keep rows whose `ringCode` cell matches the number (leading-zero
	 *     insensitive, e.g. 1 matches "0001").
	 *   - Partner Ring: keep rows whose `partnerRingCodes` cell contains a code
	 *     matching the number.
	 *   - Tube #: keep rows that have a member (`t{tube}/b{band}`) whose tube
	 *     equals the number; matching member cells are highlighted light blue.
	 *
	 * Clicking a member cell drives the Assembler cross-view highlight: the
	 * clicked band becomes the primary highlight and (in end-connection mode) the
	 * other bands in its ring become secondary highlights. The CSV omits the
	 * globule index, so clicks are resolved through the structured `index`/`tubes`
	 * (which carry full `{globule, tube, band}` addresses) rather than cell text.
	 */
	import type { BandSortIndex, TubeCutPattern } from '$lib/types';
	import type { GlobuleAddress_Band } from '$lib/projection-geometry/types';
	import {
		assemblerHighlight,
		patternSourceStore,
		sameGlobuleBand,
		setAssemblerHighlightForBand
	} from '$lib/stores';
	import {
		assemblerHighlightInPattern,
		geometrySourceOfPattern
	} from '$lib/cut-pattern/pattern-band-space';
	import { HIGHLIGHT_PRIMARY, HIGHLIGHT_SECONDARY } from '$lib/highlight-colors';
	import { findBandRow } from '$lib/cut-pattern/band-row-lookup';

	let {
		csv = '',
		index = undefined,
		tubes = undefined
	}: { csv?: string; index?: BandSortIndex; tubes?: TubeCutPattern[] } = $props();

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

	// Column lookups by header name so filtering is robust to column order and
	// to modes that lack these columns (the filter is then simply inactive).
	let ringColIdx = $derived(header.indexOf('ringCode'));
	let partnerColIdx = $derived(header.indexOf('partnerRingCodes'));

	// Flattened band addresses for tube-order mode, in the same row order as the
	// CSV (tube-major, then band). Lets a tube-order row resolve to its self band.
	let flatBands = $derived<GlobuleAddress_Band[]>(
		tubes ? tubes.flatMap((t) => t.bands.map((b) => b.address)) : []
	);

	/**
	 * Resolve a (row, column) cell to the full band address it represents and the
	 * ring it belongs to, or null if the cell isn't a clickable member.
	 *   - end-connection: row r is `index.groups[r]`; member cells start at
	 *     column 2 (after ringCode, partnerRingCodes) and map to `group.bands`.
	 *   - tube-order: row r is `flatBands[r]`; only the self column (0) resolves,
	 *     and there is no ring.
	 */
	const resolveCell = (
		r: number,
		c: number
	): { band: GlobuleAddress_Band; ring: GlobuleAddress_Band[] } | null => {
		if (!index) return null;
		if (index.mode === 'end-connection-tube') {
			const group = index.groups[r];
			if (!group) return null;
			const band = group.bands[c - 2];
			if (!band) return null;
			return { band, ring: group.bands };
		}
		if (index.mode === 'tube-order') {
			if (c !== 0) return null;
			const band = flatBands[r];
			if (!band) return null;
			return { band, ring: [] };
		}
		return null;
	};

	let ringFilter = $state<number | null>(null);
	let partnerFilter = $state<number | null>(null);
	let tubeFilter = $state<number | null>(null);

	const isActive = (v: number | null): v is number => v != null && Number.isFinite(v);

	/** Leading-zero-insensitive numeric match of a code string to a number. */
	const codeMatches = (code: string, value: number): boolean => {
		const n = Number(code);
		return Number.isFinite(n) && n === value;
	};

	/** True when `cell` contains a `t{tube}/b{band}` token whose tube === value. */
	const cellHasTube = (cell: string, value: number): boolean => {
		for (const m of cell.matchAll(/t(\d+)\/b\d+/g)) {
			if (Number(m[1]) === value) return true;
		}
		return false;
	};

	// Body rows tagged with their original index `r`, so a row stays linked to
	// `index.groups[r]` / `flatBands[r]` even after the filter reorders/removes rows.
	let filteredRows = $derived.by(() => {
		const indexed = body.map((cells, r) => ({ cells, r }));
		if (!isActive(ringFilter) && !isActive(partnerFilter) && !isActive(tubeFilter)) {
			return indexed;
		}
		return indexed.filter(({ cells }) => {
			if (isActive(ringFilter) && ringColIdx >= 0) {
				if (!codeMatches(cells[ringColIdx] ?? '', ringFilter)) return false;
			}
			if (isActive(partnerFilter) && partnerColIdx >= 0) {
				const tokens = (cells[partnerColIdx] ?? '').split(/\s+/).filter(Boolean);
				if (!tokens.some((t) => codeMatches(t, partnerFilter as number))) return false;
			}
			if (isActive(tubeFilter)) {
				if (!cells.some((c) => cellHasTube(c, tubeFilter as number))) return false;
			}
			return true;
		});
	});

	const isTubeMatch = (cell: string): boolean =>
		isActive(tubeFilter) && cellHasTube(cell, tubeFilter);

	// The grid lists the current pattern source's bands: a highlight set on another
	// 3D source names bands in that source's space, so it is not shown here.
	let paneHighlight = $derived(
		assemblerHighlightInPattern($assemblerHighlight, $patternSourceStore)
	);

	/** Cross-view selection state of a cell, for grid highlighting. */
	const cellSelection = (r: number, c: number): 'primary' | 'secondary' | null => {
		const h = paneHighlight;
		if (!h) return null;
		const resolved = resolveCell(r, c);
		if (!resolved) return null;
		if (sameGlobuleBand(resolved.band, h.band)) return 'primary';
		if (h.ring.some((b) => sameGlobuleBand(resolved.band, b))) return 'secondary';
		return null;
	};

	// Inline background wins over the tube-filter class, so a selected member cell
	// reads as selected even when it also matches the Tube # filter.
	const cellStyle = (r: number, c: number): string => {
		const sel = cellSelection(r, c);
		if (sel === 'primary') return `background-color: ${HIGHLIGHT_PRIMARY};`;
		if (sel === 'secondary') return `background-color: ${HIGHLIGHT_SECONDARY};`;
		return '';
	};

	// Goes through the shared `setAssemblerHighlightForBand` rather than passing the
	// locally-resolved ring, so a band clicked here highlights exactly the same ring
	// as the identical band clicked in the 3D view or the SVG pattern.
	const handleCellClick = (r: number, c: number) => {
		const resolved = resolveCell(r, c);
		if (!resolved) return;
		setAssemblerHighlightForBand(geometrySourceOfPattern($patternSourceStore), resolved.band);
	};

	const handleCellKeydown = (e: KeyboardEvent, r: number, c: number) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleCellClick(r, c);
		}
	};

	let autoScroll = $state(false);
	let gridScrollEl = $state<HTMLDivElement | undefined>(undefined);

	/**
	 * Bring the highlighted band's row into view when the selection changes.
	 *
	 * Scrolls `.grid-scroll` by setting `scrollTop` rather than calling
	 * `scrollIntoView`: the Assembler nests this pane inside a fixed-height
	 * `overflow: auto` section, and `scrollIntoView` would drag that section (and
	 * the page) around too. Positions are measured with `getBoundingClientRect`
	 * because `.grid-scroll` is not a positioned ancestor, so `offsetTop` would be
	 * relative to the wrong element.
	 */
	$effect(() => {
		const highlight = paneHighlight;
		const rows = filteredRows;
		const container = gridScrollEl;
		if (!autoScroll || !highlight || !container) return;

		const targetRow = findBandRow(index, flatBands, highlight.band);
		// The row may be excluded by the active filters, in which case there is
		// nothing on screen to scroll to.
		if (targetRow === null || !rows.some((row) => row.r === targetRow)) return;

		const rowEl = container.querySelector<HTMLElement>(`tbody tr[data-row="${targetRow}"]`);
		if (!rowEl) return;

		// The header is sticky, so a row scrolled to the container's top edge sits
		// underneath it and reads as invisible.
		const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height ?? 0;
		const rowRect = rowEl.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();

		// Already fully visible — don't jump the pane out from under a grid click.
		if (rowRect.top >= containerRect.top + headerHeight && rowRect.bottom <= containerRect.bottom) {
			return;
		}

		const rowTopWithinContent = rowRect.top - containerRect.top + container.scrollTop;
		container.scrollTop = Math.max(0, rowTopWithinContent - headerHeight);
	});
</script>

<div class="pattern-data">
	<div class="filters">
		<label>
			Ring
			<input type="number" min="0" bind:value={ringFilter} placeholder="#" />
		</label>
		<label>
			Partner Ring
			<input type="number" min="0" bind:value={partnerFilter} placeholder="#" />
		</label>
		<label>
			Tube #
			<input type="number" min="0" bind:value={tubeFilter} placeholder="#" />
		</label>
		<label class="checkbox">
			<input type="checkbox" bind:checked={autoScroll} />
			Auto scroll to selection
		</label>
	</div>
	<div class="grid-scroll" bind:this={gridScrollEl}>
		{#if body.length === 0}
			<p class="empty">No pattern data available.</p>
		{:else if filteredRows.length === 0}
			<p class="empty">No rows match the current filters.</p>
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
					{#each filteredRows as { cells: dataRow, r } (r)}
						<!-- The original row index, so auto-scroll can find this row after the
						     filters have reordered or removed others. -->
						<tr data-row={r}>
							{#each dataRow as cell, c (c)}
								{@const clickable = !!resolveCell(r, c)}
								<td
									class:highlight={isTubeMatch(cell)}
									class:clickable
									style={cellStyle(r, c)}
									role={clickable ? 'button' : undefined}
									tabindex={clickable ? 0 : undefined}
									onclick={() => handleCellClick(r, c)}
									onkeydown={(e) => handleCellKeydown(e, r, c)}>{cell}</td
								>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<style>
	.pattern-data {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-size: 0.8rem;
	}
	.filters {
		flex: 0 0 auto;
		display: flex;
		gap: 1rem;
		padding: 0.5rem;
		border-bottom: 1px solid #ddd;
		background-color: #f4f4f4;
	}
	.filters label {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-weight: 600;
		color: #444;
	}
	.filters input {
		width: 5rem;
		padding: 0.15rem 0.3rem;
		font-size: 0.8rem;
	}
	/* Sits alongside the number filters rather than stacking label over input. */
	.filters label.checkbox {
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		align-self: flex-end;
		white-space: nowrap;
	}
	.filters label.checkbox input {
		width: auto;
	}
	.grid-scroll {
		flex: 1 1 auto;
		overflow: auto;
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
	td.highlight {
		background-color: #add8e6;
	}
	td.clickable {
		cursor: pointer;
	}
</style>
