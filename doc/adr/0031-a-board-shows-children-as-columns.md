# 31. A board shows an item's children as columns and theirs as cards

- **Status:** accepted, 2026-10-09
- **Applies to:** `src/board.ts`, `render` in `src/render.ts`, `isBoard` in `src/notes.ts`

## Context

Martin asked for a Kanban view, suggesting that an item's children become
columns and their children cards. Outliners that have boards (WorkFlowy,
Dynalist, Checkvist) do exactly that. Tools built on records (Notion,
Trello-like apps, org-mode agendas) instead group cards by a property such
as `Status`, and moving a card changes the property.

## Decision

**Structure, as Martin proposed: `:view: board` on an item shows its
children as columns and their children as cards.** The board is the
outline itself, so sync, undo, the CLI and agents need nothing new, and
moving a card is a move. Alt-Shift-B (or ⋯ → Board) toggles the property
on the page being viewed; like `:columns:` it lives in the outline, so the
page is a board on every device.

**Cards are ordinary item editors**: the board renders in place of the
tree with the same `.item`, `.row`, `.text` and `.note` structure, and the
lookups the editor uses (`treeEditors`, `itemElementFor`) read whichever
of the two is shown. Enter, completing, links, kinds and notes work on
cards unchanged. A card with items under it says how many and links to
them.

**Moving cards:** drag by the handle with pointer events, which covers
mouse and touch alike; Alt-Shift-← and → move a card to the neighbouring
column, or a column one place over. A new card or column comes from the
buttons, or Enter.

## Options considered

**Columns from a property's values** (`:board: status`). Fits records
better than an outline and would let one card appear by status anywhere
below, but moving would mean rewriting properties and the outline would
no longer read like the board. Worth adding later as a second mode.

**A per-device switch, like Columns.** The board is how a page is used,
not a display preference, so it belongs in the outline.

## Consequences

- Searching shows the outline, not the board.
- Tab on a card nests it under the card above, out of the board's view;
  Shift-Tab brings it back.
- On a Mac, Alt-Shift-← and → no longer select by word inside a board.
- The board is rebuilt on every render rather than reusing rows
  (doc/adr/0009); boards are small.
