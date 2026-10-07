# 7. Import adds to the page instead of replacing the outline

- **Status:** accepted, 2026-10-07
- **Applies to:** `importText` and `graft` in `src/transfer.ts`

## Context

Import reads our JSON backup, OPML (WorkFlowy, Dynalist and most outliners
export it) and indented plain text or Markdown lists. The question is what
happens to the outline already there.

## Decision

Import never replaces anything. The imported items are copied with fresh ids
and appended under the page currently zoomed into, as one undoable step,
with a toast offering Undo. Restoring a backup into an empty outline is the
same operation from the home page.

Pasting several lines into an item is the same code path: the lines become
items after the current one, replacing it if it was empty.

## Options considered

**Replace the outline with the file.** Rejected: one wrong click destroys
everything, and there is no server copy to go back to
([0004](0004-localstorage-and-snapshot-undo.md)). Undo would catch it only
until the next reload.

**Keep the imported ids.** Rejected: importing the same backup twice would
create two items with one id.

## Consequences

- A full restore leaves the old content in place; clearing first is manual
  (delete the top items, or clear site data).
- The backup's root title is not restored; its children are.
