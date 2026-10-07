# 4. localStorage, one JSON document, undo by snapshots

- **Status:** accepted, 2026-10-07
- **Applies to:** `src/storage.ts`, `src/store.ts`

## Context

The brief rules out any backend: the outline lives in the browser and goes
nowhere. The candidates are localStorage and IndexedDB.

## Decision

The whole document is one JSON value under one localStorage key, written
250 ms after the last change and immediately on `pagehide` and when the tab
is hidden. Preferences (theme, show completed) sit under a second key.

A second tab sees changes through the `storage` event and adopts the newer
document as an undoable step.

Undo keeps up to 300 previous documents. Because documents share unchanged
items ([0002](0002-immutable-document-rerender-on-structure.md)), a snapshot
costs one item map, not a copy of the outline. Typing into one item is one
undo step until the user pauses for 1.2 s or moves to another item. Each
snapshot carries the caret position from before the change, so undo puts the
caret back where the change was made.

## Options considered

**IndexedDB.** Rejected for now: it is asynchronous, so saving and loading
need a state machine that localStorage does not, and its larger quota does
not matter for a text outline. It is the move to make when someone's outline
approaches the localStorage limit (around 5 MB, roughly 50,000 items).

**Saving each item under its own key.** Rejected: partial writes across keys
are not atomic, and a crash between them leaves a tree with dangling
children.

## Consequences

- No warning yet when the quota is reached; a failed save is logged to the
  console only.
- Two tabs editing at the same moment: last write wins, whole document. The
  storage event makes this unlikely in practice, not impossible.
- Undo history does not survive a reload.
- The full JSON export is the backup story; there is no automatic one.
