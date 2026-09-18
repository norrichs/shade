/**
 * What the Splits panel says after an Auto-split click.
 *
 * Split here rather than inlined in the panel so the claim can be tested
 * without a DOM — and it is a claim that matters: the solver's sizing is a
 * heuristic (`auto-split-bands.ts`, `longestParentQuadExtents`), it measures
 * centreline arc length where the layout measures a box
 * (`auto-split.ts`), and the split set is tube-wide while the constraint is
 * per band. Any of those can leave a piece still over the page, so "added N
 * split(s)" on its own is a claim the panel is not entitled to make.
 *
 * `stillOverflows` is read from the budget the renderer publishes AFTER
 * regenerating, i.e. from the same measurement the layout overflows on — not
 * from anything the solver believed.
 */
export const describeAutoSplitResult = ({
	added,
	tubes,
	stillOverflows
}: {
	added: number;
	tubes: number;
	stillOverflows: boolean;
}): string => {
	if (added === 0) return 'already split there — nothing added';
	const summary = `added ${added} split(s) across ${tubes} tube(s)`;
	return stillOverflows ? `${summary} — some pieces still overflow the page` : summary;
};
