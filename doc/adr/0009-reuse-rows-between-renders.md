# 9. Reuse rows between renders

- **Status:** accepted, 2026-10-07
- **Supersedes:** the "re-renders the visible tree from scratch" part of
  [0002](0002-immutable-document-rerender-on-structure.md). The rest of 0002
  (immutable document, no render on typing, DOM order for navigation) stands.
- **Applies to:** `renderTree`, `renderItem`, `placeChildren` in `src/app.ts`
- **Measurements:** `e2e/performance.spec.ts`

## Context

0002 chose a full rebuild of the visible tree after every structural change
and named keyed reuse as the thing to revisit if large outlines felt slow.
Measured with 5,050 visible items in headless Chromium: Enter, Tab,
Shift-Tab and Backspace each took 800 to 1,000 ms from key press to the next
frame. A key press that changes nothing took about 260 ms in the same
container, so the rebuild cost was 550 to 750 ms per edit.

## Decision

Keep each rendered row, keyed by item id, together with the item object it
was built from and a short display-state string (has children, expanded,
note open). Because items are immutable and shared between versions, "the
item object is the same" means "nothing about this item changed". Such a
row is reused untouched; any other row is rebuilt. Children lists are
reconciled in place by `placeChildren`, which moves only elements that are
out of position. Rows not visited in a render are dropped from the cache.

Typing changes a row's DOM without a render, so the input handler marks the
row as showing the current item. Without that, undo after typing reused the
row and kept showing the typed text.

## Options considered

**A virtual list (render only rows in view).** Rejected for now: variable row
heights, notes and nested guides make it much more code, and render time is
no longer the bottleneck.

**A diffing library.** Rejected for the same reasons as a framework in
[0001](0001-plain-typescript-no-ui-framework.md); the reconciliation needed
here is twenty lines.

## Consequences

- Measured after the change: render, including restoring the caret, takes
  15 to 21 ms per structural edit at 5,050 rows, and the end-to-end time
  matches the no-op baseline. `e2e/performance.spec.ts` fails above 50 ms.
- Rows now keep classes between renders, so one-off effects (the flash after
  a drop) have to be restarted explicitly.
- Any new piece of display state that changes a row's markup must go into
  the display-state string, or the row will not be rebuilt when it changes.
