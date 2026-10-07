# 16. Touch: a large fold target and swipes on rows

- **Status:** accepted, 2026-10-08
- **Applies to:** `src/gestures.ts`, touch rules in `src/style.css`

## Context

Martin finds the fold toggle too small on a phone. The toggle is an 18 px
chevron in the gutter; a finger needs about 44 px. Phones also have no
keyboard shortcuts, so completing or folding goes through the editing
toolbar or the item menu, both slower than a gesture.

What other outliners do, looked up on 2026-10-08: WorkFlowy swipes right to
complete and left to open the item's menu (a long left swipe deletes);
Dynalist swipes right to complete and left to delete, behind a confirmation.
Both fold with a tap on a control; neither indents by swiping, though users
keep asking for it.

## Decision

- On touch screens the fold target covers the whole gutter left of the
  bullet and the full row height, at least 44 px, without moving the layout.
  The chevron is larger and always visible on rows with children.
- Swipe right on a row completes it, or reopens it, like WorkFlowy and
  Dynalist. A green band with a check follows the finger.
- Swipe left on a row folds or unfolds it when it has children, and opens
  the item menu otherwise. The band shows which of the two will happen.
- A swipe counts once the finger has moved 72 px sideways and clearly more
  sideways than down; until then the page scrolls as usual. Rows only let the
  browser pan vertically (`touch-action: pan-y`), so the sideways movement
  reaches the app. Swipes starting within 24 px of the screen edge are left to
  the system's back gesture. A short vibration marks the threshold where the
  device supports it.

## Options considered

**Swipe to indent and outdent.** Rejected: it would take the gestures that
the two best-known outliners use for completing, and the editing toolbar
already indents and outdents.

**Pinch to fold everything.** Rejected: blocking pinch would break browser
zoom, which some people need to read.

**Swipe left to delete.** Rejected: a destructive action on an easy gesture;
delete stays in the item menu, with undo.

## Consequences

- A swipe that starts on an item's text is a swipe, not text selection;
  selecting text on a phone uses long press, which is unaffected.
- The tap after a swipe is swallowed so the row does not also start editing.
