# Implementation Plan: Manual Computation Mode

**Status:** Planned (Not Started)
**Created:** 2026-02-01
**Estimated Time:** 2.5 hours
**Priority:** Medium

## Overview

Add a "manual" computation mode that prevents automatic regeneration of 3D geometry and patterns when configs change. Users must explicitly click a "Regenerate" button to apply changes.

**Key Behaviors:**

- Manual mode is **orthogonal** to existing computation modes (continuous, 3d-only, 2d-only)
- Controls **when** computation happens, not **what** gets computed
- Works in combination: "manual + 3d-only" = manual trigger, only generates 3D

## User Experience

**Interaction Matrix:**

```
                    Manual OFF              Manual ON
continuous      Auto 3D + Auto Pattern   Manual 3D + Manual Pattern
3d-only         Auto 3D                  Manual 3D
2d-only         Frozen 3D + Auto Pattern Manual Pattern only
```

**UI Elements:**

1. Checkbox in designer header to toggle manual mode on/off
2. "Regenerate" button in NavBar (next to "Edit" button)
3. Pending indicator ("⚠ Changes pending") when config changes but hasn't regenerated
4. Button states:
   - Hidden when manual mode OFF
   - Disabled when no pending changes or worker busy
   - Orange/pulsing when pending changes

---

## Architecture Design

### State Management

**New Stores (in `src/lib/stores/uiStores.ts`):**

```typescript
// Manual mode toggle (persists to localStorage)
export const isManualMode = persistable<boolean>(false, 'ManualMode', ...);

// Track whether config has changed since last regeneration (ephemeral)
export const hasPendingChanges = writable<boolean>(false);
```

**Manual Trigger Function (in `src/lib/stores/superGlobuleStores.ts`):**

```typescript
export function triggerManualRegeneration(): void {
	// Check manual mode, worker state
	// Clear pending flag
	// Trigger 3D/pattern based on computation mode
}
```

### Auto-Update Prevention Strategy

**Current Auto-Update Points:**

1. `superConfigStore.subscribe()` → `triggerAsyncGeneration()` (3D)
2. Derived pattern store auto-computes when geometry changes

**Manual Mode Prevention:**

- Add `isManualMode` check in config subscription
- Set `hasPendingChanges = true` when config changes in manual mode
- Return early without triggering generation
- Pattern store checks `hasPendingChanges` and returns cached result

**Data Flow:**

```
superConfigStore (config changes)
    ↓
[Manual Mode Gate] ← NEW: if manual, set pending & return
    ↓ (only if NOT manual OR explicit trigger)
triggerAsyncGeneration()
    ↓
superGlobuleInternal
    ↓
superGlobulePatternStore ← NEW: pauses if manual + pending
```

---

## Implementation Steps

### Phase 1: Store Infrastructure (30 min)

#### Step 1.1: Add Types & Stores

**File:** `src/lib/stores/uiStores.ts`
**Location:** After line 23 (after `computationMode`)

```typescript
// Manual mode: prevents auto-updates, requires explicit trigger
export const isManualMode = persistable<boolean>(false, 'ManualMode', AUTO_PERSIST_KEY, true);

// Track whether config has changed since last regeneration
export const hasPendingChanges = writable<boolean>(false);
```

**Risk:** Very Low

---

#### Step 1.2: Export Manual Trigger Function

**File:** `src/lib/stores/superGlobuleStores.ts`
**Location:** After line 42 (after `isGenerating` export)

**Add imports:**

```typescript
import { isManualMode, hasPendingChanges } from './uiStores';
import { toastStore } from './toastStore';
```

**Add function:**

```typescript
/**
 * Manual trigger for regenerating geometry/patterns when in manual mode
 * Checks worker state and respects current computation mode
 */
export function triggerManualRegeneration(): void {
	const config = get(superConfigStore);
	const mode = get(computationMode);
	const manual = get(isManualMode);
	const working = get(workerIsWorking);

	if (!manual) {
		console.warn('triggerManualRegeneration called but not in manual mode');
		return;
	}

	// Don't trigger if worker is already busy
	if (working) {
		console.warn('triggerManualRegeneration: Worker already busy, skipping');
		toastStore.add({
			type: 'warning',
			message: 'Generation already in progress, please wait...',
			duration: 3000
		});
		return;
	}

	// Clear pending changes flag
	hasPendingChanges.set(false);

	// Reset pause flag (for 2d-only mode)
	pausePatternUpdates.set(false);

	// Trigger 3D regeneration (unless in 2d-only mode)
	if (mode !== '2d-only') {
		console.log('MANUAL TRIGGER: Regenerating 3D geometry');
		triggerAsyncGeneration(config);
	} else {
		// In 2d-only mode, unsetting pausePatternUpdates triggers pattern update
		console.log('MANUAL TRIGGER: Regenerating patterns only');
	}
}
```

**Risk:** Low

---

### Phase 2: Auto-Update Prevention (45 min)

#### Step 2.1: Modify 3D Geometry Subscription

**File:** `src/lib/stores/superGlobuleStores.ts`
**Location:** Lines 169-200 (config subscription)

**Change:**

```typescript
if (browser) {
	superConfigStore.subscribe((config) => {
		const currentMode = get(computationMode);
		const manual = get(isManualMode);  // NEW

		// Check if we're in 2d-only mode
		if (currentMode === '2d-only' && isInitialized) {
			console.log('MODE TRANSITION: Geometry config changed in 2d-only mode, switching to continuous');
			computationMode.set('continuous');
			return;
		}

		// NEW: MANUAL MODE - Don't auto-generate, just mark pending
		if (manual && isInitialized) {
			console.log('MANUAL MODE: Config changed, marking pending (not auto-generating)');
			hasPendingChanges.set(true);
			return;
		}

		if (!isInitialized) {
			// Initial sync generation (unchanged)
			console.log('SUPER GLOBULE STORE - Initial sync generation');
			try {
				const result = generateSuperGlobule(config);
				lastValidResult = result;
				superGlobuleInternal.set(result);
				isInitialized = true;
			} catch (error) {
				console.error('SUPER GLOBULE STORE - Initial generation failed:', error);
				isInitialized = true;
			}
		} else {
			// Subsequent changes use async generation (only if NOT manual)
			triggerAsyncGeneration(config);
		}
	});
	// ... rest unchanged
```

**Key:** Manual check comes AFTER `isInitialized` check to preserve first render

**Risk:** Medium - modifies critical auto-update path

---

#### Step 2.2: Modify Pattern Store Dependencies

**File:** `src/lib/stores/superGlobuleStores.ts`
**Location:** Lines 272-295 (pattern store)

**Change:**

```typescript
const superGlobulePatternStoreInternal = derived(
	[
		superGlobuleStore,
		superConfigStore,
		patternConfigStore,
		overrideStore,
		computationMode,
		pausePatternUpdates,
		isManualMode,        // NEW
		hasPendingChanges    // NEW
	],
	([
		$superGlobuleStore,
		$superConfigStore,
		$patternConfigStore,
		$overrideStore,
		$computationMode,
		$pausePatternUpdates,
		$isManualMode,       // NEW
		$hasPendingChanges   // NEW
	]): {...} | 'paused' => {
		// Skip if paused
		if ($pausePatternUpdates) {
			console.log('PATTERN STORE: Updates paused');
			return 'paused' as const;
		}

		// NEW: MANUAL MODE - Pause patterns when pending changes
		if ($isManualMode && $hasPendingChanges) {
			console.log('PATTERN STORE: Manual mode with pending changes, returning cached');
			return 'paused' as const;
		}

		// Skip in 3d-only mode
		if ($computationMode === '3d-only') {
			return { superGlobulePattern: null, projectionPattern: undefined, globuleTubePattern: null };
		}

		// ... rest of pattern generation (unchanged)
```

**Risk:** Medium - affects pattern generation trigger

---

#### Step 2.3: Handle Mode Transitions with Manual Mode

**File:** `src/lib/stores/superGlobuleStores.ts`
**Location:** Lines 214-242 (mode transition handler)

**Change:**

```typescript
// Handle computation mode transitions
let previousMode: string | null = null;
computationMode.subscribe(($mode) => {
	if (previousMode === null) {
		previousMode = $mode;
		return;
	}

	const manual = get(isManualMode); // NEW
	const enteringTwoDOnly = $mode === '2d-only' && previousMode !== '2d-only';
	const leavingTwoDOnly = $mode !== '2d-only' && previousMode === '2d-only';

	if (enteringTwoDOnly) {
		console.log('MODE TRANSITION: Entering 2d-only mode');
	}

	if (leavingTwoDOnly) {
		console.log('MODE TRANSITION: Leaving 2d-only mode, triggering regeneration');

		// NEW: Manual mode check
		if (manual) {
			console.log('MODE TRANSITION: Manual mode active, marking pending instead');
			hasPendingChanges.set(true);
		} else {
			const config = get(superConfigStore);
			triggerAsyncGeneration(config);
		}
	}

	previousMode = $mode;
});
```

**Risk:** Low

---

### Phase 3: UI Components (60 min)

#### Step 3.1: Add Manual Mode Checkbox

**File:** `src/routes/designer2/+page.svelte`
**Location:** After line 79 (after computation mode select)

**Add imports:**

```typescript
import { isManualMode, hasPendingChanges } from '$lib/stores/uiStores';
import { triggerManualRegeneration } from '$lib/stores/superGlobuleStores';
```

**Add HTML:**

```svelte
<div class="mode-control">
	<label for="computation-mode">Mode:</label>
	<select id="computation-mode" bind:value={$computationMode}>
		<option value="continuous">Continuous</option>
		<option value="3d-only">3D Only</option>
		<option value="2d-only">2D Only</option>
	</select>
</div>

<!-- NEW SECTION -->
<div class="manual-mode-control">
	<label>
		<input type="checkbox" bind:checked={$isManualMode} />
		Manual Mode
	</label>
	{#if $isManualMode && $hasPendingChanges}
		<span class="pending-indicator">⚠ Changes pending</span>
	{/if}
</div>
```

**Add CSS:**

```css
.manual-mode-control {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 0.875rem;
}

.manual-mode-control label {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	font-weight: 500;
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
```

**Risk:** Low

---

#### Step 3.2: Add Regenerate Button to NavBar

**File:** `src/components/nav-header/NavHeader.svelte`
**Location:** After line 95 (after "Edit" button)

**Add imports:**

```typescript
import { isManualMode, hasPendingChanges } from '$lib/stores/uiStores';
import { triggerManualRegeneration, isGenerating } from '$lib/stores/superGlobuleStores';

$: regenerateDisabled = !$isManualMode || $isGenerating || !$hasPendingChanges;
```

**Add button:**

```svelte
<div class="button-group">
	<Button on:click={toggleModal}>Edit</Button>

	<!-- NEW: Regenerate button (only visible in manual mode) -->
	{#if $isManualMode}
		<Button
			on:click={triggerManualRegeneration}
			disabled={regenerateDisabled}
			class:pending={$hasPendingChanges}
		>
			{#if $isGenerating}
				Regenerating...
			{:else if $hasPendingChanges}
				Regenerate ⚠
			{:else}
				Regenerate
			{/if}
		</Button>
	{/if}

	<!-- rest of buttons -->
</div>
```

**Add CSS:**

```css
:global(button.pending) {
	background-color: #ff9800;
	animation: pulse-button 2s ease-in-out infinite;
}

:global(button:disabled) {
	opacity: 0.5;
	cursor: not-allowed;
}

@keyframes pulse-button {
	0%,
	100% {
		box-shadow: 2px 2px 10px 0px var(--color-shaded-dark);
	}
	50% {
		box-shadow: 0 0 15px 3px rgba(255, 152, 0, 0.6);
	}
}
```

**Risk:** Low

---

#### Step 3.3: Update Button Component for Disabled State

**File:** `src/components/design-system/Button.svelte`

**Add prop:**

```typescript
export let disabled: boolean = false;
```

**Update button:**

```svelte
<button on:click on:mousedown on:mouseup class={variant} {disabled} class:disabled>
	<slot />
</button>
```

**Add CSS:**

```css
.standard:disabled,
.standard.disabled {
	opacity: 0.5;
	cursor: not-allowed;
	pointer-events: none;
}
```

**Risk:** Very Low

---

### Phase 4: Edge Case Handling (30 min)

#### Step 4.1: Handle Manual Mode Toggle

**File:** `src/lib/stores/superGlobuleStores.ts`
**Location:** After line 242 (after mode transition handler)

```typescript
// Handle manual mode transitions
if (browser) {
	let previousManualMode: boolean | null = null;
	isManualMode.subscribe(($isManual) => {
		// Skip initial subscription
		if (previousManualMode === null) {
			previousManualMode = $isManual;
			return;
		}

		const turningOffManual = !$isManual && previousManualMode;

		if (turningOffManual) {
			// Turning off manual: auto-regenerate if pending
			const pending = get(hasPendingChanges);
			if (pending) {
				console.log('MANUAL MODE: Disabled with pending changes, auto-regenerating');
				const config = get(superConfigStore);
				const mode = get(computationMode);

				hasPendingChanges.set(false);

				if (mode !== '2d-only') {
					triggerAsyncGeneration(config);
				}

				pausePatternUpdates.set(false);
			}
		}

		previousManualMode = $isManual;
	});
}
```

**Risk:** Low

---

## Edge Cases Handled

### Case 1: Switching Modes While Manual Active

- Pending flag stays true
- Mode transition doesn't auto-trigger
- User must regenerate manually

### Case 2: Disabling Manual with Pending Changes

- Auto-regenerate immediately
- Clear pending flag
- Resume normal auto-update behavior

### Case 3: Worker Already Running

- Check `workerIsWorking` store
- Show toast warning
- Ignore click, keep pending flag

### Case 4: Manual Mode Persistence

- `isManualMode` persists to localStorage
- `hasPendingChanges` does NOT persist (ephemeral)
- On reload: manual mode enabled, no pending (geometry already generated)

### Case 5: Manual + 2d-Only Mode

- Pattern updates paused when pending
- Click "Regenerate": only patterns update
- 3D stays frozen

---

## Testing Strategy

### Functional Tests

1. **Manual prevents 3D auto-update:** Enable manual, change geometry → pending, no update → regenerate → updates
2. **Manual prevents pattern auto-update:** Enable manual, change pattern → pending, no update → regenerate → updates
3. **Manual + 3d-only:** Only 3D updates on regenerate
4. **Manual + 2d-only:** Only patterns update on regenerate
5. **Manual + continuous:** Both 3D and patterns update on regenerate

### Edge Case Tests

6. **Disable manual with pending:** Auto-regenerate immediately
7. **Worker busy protection:** Rapid clicks show toast warning
8. **Mode transition with pending:** No auto-regenerate, pending stays
9. **Page reload persistence:** Manual mode persists, no pending flag
10. **Initial render:** Works normally even with manual mode on

### UI State Tests

11. **Button visibility:** Hidden when manual OFF, visible when ON
12. **Button states:** Disabled (no pending), enabled+orange (pending), disabled+text (working)
13. **Pending indicator:** Appears on change, disappears on regenerate

---

## Risk Assessment

**High Risk:**

- Config subscription modification (affects initial render, auto-update logic)
- Pattern store dependencies (affects pattern rendering)

**Mitigation:**

- Manual check comes AFTER `isInitialized` check
- Extensive logging for debugging
- Return `'paused'` marker (same as existing pause logic)

**Medium Risk:**

- Mode transition handler
- Manual trigger function

**Low Risk:**

- UI components (isolated changes)
- Store additions (new stores don't affect existing logic)

---

## Rollback Plan

### If Auto-Updates Still Happening

Comment out manual check in config subscription:

```typescript
/*
if (manual && isInitialized) {
  hasPendingChanges.set(true);
  return;
}
*/
```

### If Initial Render Breaks

Verify manual check comes AFTER `isInitialized` check

### Full Revert

```bash
git checkout main -- src/lib/stores/uiStores.ts
git checkout main -- src/lib/stores/superGlobuleStores.ts
git checkout main -- src/routes/designer2/+page.svelte
git checkout main -- src/components/nav-header/NavHeader.svelte
git checkout main -- src/components/design-system/Button.svelte
```

---

## Files Modified

1. `src/lib/stores/uiStores.ts` - Add manual mode stores (~10 lines)
2. `src/lib/stores/superGlobuleStores.ts` - Core logic (~135 lines added/modified)
3. `src/routes/designer2/+page.svelte` - Checkbox UI (~30 lines)
4. `src/components/nav-header/NavHeader.svelte` - Regenerate button (~40 lines)
5. `src/components/design-system/Button.svelte` - Disabled state (~10 lines)

**Total:** ~225 lines added/modified across 5 files

---

## Timeline

**Total Estimated Time:** 2.5 hours

**Sequence:**

1. Phase 1 - Store infrastructure (30 min)
2. Phase 2 - Auto-update prevention (45 min)
3. Phase 3 - UI components (60 min)
4. Phase 4 - Edge cases (30 min)
5. Testing - Comprehensive testing (45 min)

**Parallel Development Possible:**

- Developer A: Phase 1 + 2 (backend/stores)
- Developer B: Phase 3 (UI components)
- Total: 1.5 hours (parallel)

---

## Future Enhancements (Not in This Plan)

1. Keyboard shortcut (`Cmd/Ctrl+R`) to regenerate
2. Diff view showing what changed since last regeneration
3. Partial regeneration (only changed parts)
4. Batch mode (queue multiple changes, regenerate once)
5. Regeneration history (undo/redo)

---

## Notes

- Plan created: 2026-02-01
- Agent ID: a36dd35 (for resuming planning agent if needed)
- Related work: Mode-based compartmentalization (feature/compartmentalize branch)
- Performance optimizations (BVH, material swap, camera LOD)
