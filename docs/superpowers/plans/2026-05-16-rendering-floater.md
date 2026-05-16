# Rendering Floater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the rendering controls (computation mode, Manual, Pause Patterns + Refresh) out of `/designer2/+page.svelte`'s inline header into a `Rendering` Floater registered in the `utilities` sidebar group, freeing horizontal space in the menu bar.

**Architecture:** Rename the existing-but-unregistered `ComputationMode.svelte` to `Rendering.svelte` with three label trims (drop section header; "Manual Mode" → "Manual"; "Pause Pattern Updates" → "Pause Patterns"), preserve the pending-indicator pulse animation, register it as the 4th entry in the `utilities` Map, then delete the corresponding inline blocks, function, imports, and CSS from `+page.svelte`.

**Tech Stack:** Svelte 5 (legacy mode), TypeScript, existing `Floater` / `HoverSidebar` plumbing, existing `uiStores` writables. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-16-rendering-floater-design.md`

**Conventions:** Codebase uses tabs for indentation. All code blocks below use tabs.

---

### Task 1: Create `Rendering.svelte` from `ComputationMode.svelte`

**Files:**
- Create: `src/components/modal/editor/Rendering.svelte`
- Source reference: `src/components/modal/editor/ComputationMode.svelte` (existing, will be deleted in Task 2)

The existing `ComputationMode.svelte` is almost what we want. We're creating a new file (rather than `git mv`) because we're also adjusting labels and adding the pulse animation that lives on the inline copy. The old file gets deleted in Task 2.

- [ ] **Step 1: Create `src/components/modal/editor/Rendering.svelte`**

```svelte
<script lang="ts">
	import {
		computationMode,
		pausePatternUpdates,
		isManualMode,
		hasPendingChanges
	} from '$lib/stores/uiStores';
	import { superGlobulePatternStore } from '$lib/stores/superGlobuleStores';
	import Container from './Container.svelte';
	import Editor from './Editor.svelte';

	function refreshPatterns() {
		pausePatternUpdates.set(false);
		// Force derived store to re-evaluate by subscribing and immediately unsubscribing.
		// Relies on Svelte's synchronous derived store execution during subscribe.
		superGlobulePatternStore.subscribe(() => {})();
	}
</script>

<Editor>
	<section>
		<Container direction="column">
			<label>
				Mode
				<select bind:value={$computationMode}>
					<option value="continuous">Continuous</option>
					<option value="3d-only">3D Only</option>
					<option value="2d-only">2D Only</option>
				</select>
			</label>
			<label>
				<input type="checkbox" bind:checked={$isManualMode} />
				Manual
				{#if $isManualMode && $hasPendingChanges}
					<span class="pending-indicator">⚠ pending</span>
				{/if}
			</label>
			<label>
				<input type="checkbox" bind:checked={$pausePatternUpdates} />
				Pause Patterns
			</label>
			{#if $pausePatternUpdates}
				<button onclick={refreshPatterns}>Refresh</button>
			{/if}
		</Container>
	</section>
</Editor>

<style>
	label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
	}

	.pending-indicator {
		color: #ff9800;
		font-size: 0.75rem;
		font-weight: 600;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
```

Differences from `ComputationMode.svelte`:
- `<header>Computation Mode</header>` removed.
- `Manual Mode` → `Manual`.
- `Pause Pattern Updates` → `Pause Patterns`.
- Pulse animation added to `.pending-indicator` (carried over from the inline copy in `+page.svelte`).

- [ ] **Step 2: Run type check**

Run: `npm run check 2>&1 | grep -E "Rendering.svelte" || echo "no new errors in Rendering.svelte"`
Expected: `no new errors in Rendering.svelte`

(The repo has ~431 pre-existing type errors; only check that we didn't add any in our new file.)

- [ ] **Step 3: Commit**

```bash
git add src/components/modal/editor/Rendering.svelte
git commit -m "feat: add Rendering.svelte floater with trimmed labels"
git push
```

---

### Task 2: Register `Rendering` floater in `utilities`; delete `ComputationMode.svelte`

**Files:**
- Modify: `src/components/modal/sidebar-definitions.ts`
- Delete: `src/components/modal/editor/ComputationMode.svelte`

- [ ] **Step 1: Add the import and the registry entry**

In `src/components/modal/sidebar-definitions.ts`, add this import alongside the other `./editor/*` imports near the top of the file:

```ts
import Rendering from './editor/Rendering.svelte';
```

Then add a 4th entry to the `utilities` Map, after the `Configs` entry. Change:

```ts
export const utilities: SidebarDefinition = new Map([
	[
		'Utilities',
		{
			shortTitle: 'UT',
			title: 'Utilities',
			content: Utilities
		}
	],
	[
		'Selection',
		{
			shortTitle: 'SL',
			title: 'Selection',
			content: Selection
		}
	],
	[
		'Configs',
		{
			shortTitle: 'CF',
			title: 'Configs',
			content: ConfigManager
		}
	]
]);
```

to:

```ts
export const utilities: SidebarDefinition = new Map([
	[
		'Utilities',
		{
			shortTitle: 'UT',
			title: 'Utilities',
			content: Utilities
		}
	],
	[
		'Selection',
		{
			shortTitle: 'SL',
			title: 'Selection',
			content: Selection
		}
	],
	[
		'Configs',
		{
			shortTitle: 'CF',
			title: 'Configs',
			content: ConfigManager
		}
	],
	[
		'Rendering',
		{
			shortTitle: 'RN',
			title: 'Rendering',
			content: Rendering
		}
	]
]);
```

- [ ] **Step 2: Confirm no other consumer of `ComputationMode.svelte`**

Run: `grep -rn "ComputationMode" src 2>/dev/null`
Expected: only the file itself appears (no other imports).

If anything else imports it, stop and report — there's an unexpected consumer.

- [ ] **Step 3: Delete the old component**

```bash
git rm src/components/modal/editor/ComputationMode.svelte
```

- [ ] **Step 4: Type check passes (no regressions from this edit)**

Run: `npm run check 2>&1 | tail -3`
Expected: an error count not higher than baseline (~431). `sidebar-definitions.ts` and `Rendering.svelte` should produce zero new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/modal/sidebar-definitions.ts
git commit -m "feat: register Rendering floater in utilities; remove ComputationMode.svelte"
git push
```

---

### Task 3: Remove inline rendering UI from `/designer2/+page.svelte`

**Files:**
- Modify: `src/routes/designer2/+page.svelte`

The page currently renders the rendering controls inline in `<header>`, and also defines `refreshPatterns` and imports stores it uses. All of that moves to the floater; the page should no longer reference it.

- [ ] **Step 1: Remove the three inline `<div>` blocks from `<header>`**

In `src/routes/designer2/+page.svelte`, find the block from `<div class="mode-control">` through `</div>` for `.pattern-control` (currently lines 77–102) and delete it. The surrounding `<header>` keeps the `<SelectBar />` that precedes it; the `</header>` line that follows is unchanged.

Before:

```svelte
				/>
				<div class="mode-control">
					<label for="computation-mode">Mode:</label>
					<select id="computation-mode" bind:value={$computationMode}>
						<option value="continuous">Continuous</option>
						<option value="3d-only">3D Only</option>
						<option value="2d-only">2D Only</option>
					</select>
				</div>
				<div class="manual-mode-control">
					<label>
						<input type="checkbox" bind:checked={$isManualMode} />
						Manual Mode
					</label>
					{#if $isManualMode && $hasPendingChanges}
						<span class="pending-indicator">⚠ Changes pending</span>
					{/if}
				</div>
				<div class="pattern-control">
					<label>
						<input type="checkbox" bind:checked={$pausePatternUpdates} />
						Pause Pattern Updates
					</label>
					{#if $pausePatternUpdates}
						<button on:click={refreshPatterns} class="refresh-btn">Refresh</button>
					{/if}
				</div>
			</header>
```

After:

```svelte
				/>
			</header>
```

- [ ] **Step 2: Remove the `refreshPatterns` function**

Delete the function definition (currently lines 32–36) entirely:

```ts
	function refreshPatterns() {
		pausePatternUpdates.set(false);
		// Force re-subscription to trigger update
		superGlobulePatternStore.subscribe(() => {})();
	}
```

- [ ] **Step 3: Trim the unused store imports**

Current import statement:

```ts
	import {
		uiStore,
		type ViewModeSetting,
		computationMode,
		pausePatternUpdates,
		isManualMode,
		hasPendingChanges
	} from '$lib/stores/uiStores';
```

Replace with:

```ts
	import { uiStore, type ViewModeSetting } from '$lib/stores/uiStores';
```

Then update the `superGlobuleStores` import. Current:

```ts
	import {
		superGlobulePatternStore,
		triggerManualRegeneration
	} from '$lib/stores/superGlobuleStores';
```

Verify `triggerManualRegeneration` is still used elsewhere in the file with:

```
grep -n "triggerManualRegeneration\|superGlobulePatternStore" src/routes/designer2/+page.svelte
```

- If `triggerManualRegeneration` has other usages and `superGlobulePatternStore` does not, replace with: `import { triggerManualRegeneration } from '$lib/stores/superGlobuleStores';`
- If both still have usages, leave the import unchanged.
- If neither has remaining usages, remove the import statement entirely.

Note: the `{#if $computationMode !== '3d-only'}` guard at line ~55 referenced `$computationMode`. **This guard stays, because the spec preserves it.** Since the import was removed in step 3, the guard would now be a build error. Therefore, you MUST keep the `computationMode` import in the `uiStores` import. Correct that step: the final `uiStores` import is:

```ts
	import { uiStore, type ViewModeSetting, computationMode } from '$lib/stores/uiStores';
```

- [ ] **Step 4: Remove the now-orphaned CSS rules**

In the `<style>` block, delete these rules and their bodies (currently spanning lines 171–250):

- `.mode-control`
- `.mode-control label`
- `.mode-control select`
- `.manual-mode-control`
- `.manual-mode-control label`
- `.pending-indicator`
- `@keyframes pulse` (only consumer in this file was `.pending-indicator`; styles are scoped per Svelte component, so other components' pulse keyframes are unaffected)
- `.pattern-control`
- `.pattern-control label`
- `.refresh-btn`
- `.refresh-btn:hover`

The rule `.container.controls .group` (currently line 251) stays — it's unrelated.

- [ ] **Step 5: Verify no lingering references**

Run:

```bash
grep -nE "refreshPatterns|mode-control|manual-mode-control|pattern-control|pending-indicator|refresh-btn|pausePatternUpdates|isManualMode|hasPendingChanges" src/routes/designer2/+page.svelte
```

Expected output: empty (no matches).

- [ ] **Step 6: Type-check still clean**

Run: `npm run check 2>&1 | tail -3`
Expected: error count not higher than baseline (~431). No new errors in `+page.svelte`.

If you see new errors mentioning `+page.svelte`, you likely missed a reference. Fix and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/routes/designer2/+page.svelte
git commit -m "refactor: remove inline rendering UI from designer (moved to Rendering floater)"
git push
```

---

### Task 4: Manual smoke test in the browser

**Files:** none (manual verification).

Per CLAUDE.md, UI changes require running the dev server and exercising the feature in a browser before claiming the task complete.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Note the local URL printed (typically `http://localhost:5173/designer2`).

- [ ] **Step 2: Verify the sidebar shows the `RN` button**

Open `/designer2` in the browser. Confirm the sidebar (HoverSidebar) lists `RN` alongside `UT`, `SL`, `CF`. (The HoverSidebar may auto-collapse; hover to reveal.)

If `RN` is missing: the registration in Task 2 didn't take. Verify `sidebar-definitions.ts` and check the browser console for import errors.

- [ ] **Step 3: Open the floater and verify controls**

Click the `RN` button. A "Rendering" floater opens with:
- A `Mode` dropdown with options `Continuous` / `3D Only` / `2D Only`.
- A `Manual` checkbox.
- A `Pause Patterns` checkbox.

Confirm the `<header>Computation Mode</header>` text is absent (no section title above the controls — the floater title bar shows "Rendering").

- [ ] **Step 4: Exercise each control**

- Toggle `Mode` to `3D Only`. The 2D `PatternViewer` section disappears (the existing `{#if $computationMode !== '3d-only'}` guard takes effect). Switch back to `Continuous`; the section reappears.
- Toggle `Manual` on. Make a change to a config that would normally trigger regeneration (e.g., adjust a number in any other floater). Confirm the `⚠ pending` indicator appears next to `Manual` and pulses. Toggle `Manual` off; pending indicator clears.
- Toggle `Pause Patterns` on. A `Refresh` button appears. Click it; the button disappears (`pausePatternUpdates` was set back to `false`).

- [ ] **Step 5: Verify the menu bar is no longer crowded**

Inspect the `/designer2` header (`SelectBar` row). All entries — `Silhouette`, `Depth`, `Spine`, `Shape`, `Projection`, `Levels`, `Struts`, `Cut`, `Pattern`, `Super` — fit on one line at normal viewport widths (1280px+). The rendering controls are no longer to the right of the SelectBar.

- [ ] **Step 6: Stop the dev server**

Ctrl+C or kill the dev process.

- [ ] **Step 7: Commit a no-op "verified" marker if any tweaks were needed**

If any of the above steps required code adjustments, commit them as a follow-up. If everything worked on the first try, no commit needed for this task.

---

### Task 5: Open a PR

**Files:** none.

- [ ] **Step 1: Push the branch if not already**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Create the PR via `gh`**

```bash
gh pr create --title "Rendering floater UI cleanup" --body "$(cat <<'EOF'
## Summary
- Moves inline rendering controls (Mode dropdown, Manual checkbox, Pause Patterns + Refresh) out of `/designer2`'s header into a new `Rendering` floater registered in the `utilities` sidebar group (shortTitle `RN`).
- Reuses the existing `ComputationMode.svelte` (renamed `Rendering.svelte`) with three label trims: drop the section header, `Manual Mode` → `Manual`, `Pause Pattern Updates` → `Pause Patterns`. Preserves the pending-indicator pulse animation.
- Frees horizontal space in the menu bar so the `SelectBar` entries are no longer pushed off-screen.

## Test plan
- [x] Sidebar lists `RN` alongside `UT`, `SL`, `CF`.
- [x] Opening the `RN` floater renders Mode dropdown, Manual, and Pause Patterns controls.
- [x] Toggling Mode to `3D Only` hides the 2D PatternViewer; switching back restores it.
- [x] Manual + pending state shows the pulsing indicator and clears when toggled off.
- [x] Pause Patterns shows the Refresh button; clicking it resumes pattern updates.
- [x] Menu bar entries fit at typical viewport widths with no inline rendering UI to the right.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL.

---

## Self-Review

**Spec coverage:**
- ✅ Rename `ComputationMode.svelte` → `Rendering.svelte` (Task 1)
- ✅ Drop section header (Task 1, Step 1)
- ✅ `Manual Mode` → `Manual` (Task 1, Step 1)
- ✅ `Pause Pattern Updates` → `Pause Patterns` (Task 1, Step 1)
- ✅ Dropdown options unchanged (Task 1, Step 1)
- ✅ Pending tag and Refresh button behavior unchanged (Task 1, Step 1; pulse animation preserved)
- ✅ Register in `utilities` with `shortTitle: 'RN'` (Task 2)
- ✅ Available in both projection and globule designer modes (automatic via `utilities` spread)
- ✅ Delete inline `<div class="mode-control">`, `.manual-mode-control`, `.pattern-control` (Task 3, Step 1)
- ✅ Delete `refreshPatterns` (Task 3, Step 2)
- ✅ Trim unused imports (Task 3, Step 3 — preserves `computationMode` for the unchanged `!== '3d-only'` guard)
- ✅ Delete matching CSS rules including `@keyframes pulse` (Task 3, Step 4)
- ✅ Spec's "Not changing" items (the `{#if $computationMode !== '3d-only'}` guard, `uiStores` module, floater plumbing) remain untouched
- ✅ Manual smoke test exercises all three controls and the menu-bar width fix (Task 4)
- ✅ "No new unit/E2E tests" — plan has no test tasks beyond manual exercise

**Placeholder scan:** no TBDs, no TODOs, no "implement later", no abstract "handle edge cases", every code step has complete code.

**Type consistency:** all property/store/component names verified against actual source files (`computationMode`, `pausePatternUpdates`, `isManualMode`, `hasPendingChanges`, `superGlobulePatternStore`, `Editor`, `Container`, `SidebarDefinition`, `FloaterContent`).
