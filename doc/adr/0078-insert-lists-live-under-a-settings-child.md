# 78. Insert lists live under a \_settings child

- **Status:** accepted, 2026-11-28
- **Extends:** [0044](0044-an-item-with-a-query-lists-the-items-that-match.md),
  whose queries only listed items, and
  [0071](0071-a-checks-child-types-the-properties-under-its-parent.md), whose
  `Checks:` child set up what is under its parent
- **Applies to:** `src/insertLists.ts`, `src/model.ts`, `src/palette.ts`,
  `src/editing.ts`, `src/keys.ts`, `src/shortcuts.ts`, `src/chrome.ts`,
  `src/addMenu.ts`, `src/render.ts`, `src/board.ts`

## Context

Logging a meal means adding a line that points at a food with its grams, or
repeating an earlier meal. Link to… writes one link at the caret, Duplicate
copies an item next to itself, and a mirror shows an item read-only: none adds
a line under an item from a set of candidates the outline itself defines.

## Decision

- A child titled `_settings` holds an item's settings; its child `Insert`
  holds the lists. Both titles match whole, ignoring case, and `Insert` means
  nothing outside a `_settings`.
- A list is a child of `Insert`, titled as its tab, with a `query` over the
  whole outline, completed items included, and an `insert`: `link into KEY`,
  `link into KEY with KEY KEY`, `copy` or `copy contents`, each maybe followed
  by `, last first`. A KEY may not be a setting such as `private` or `query`.
  `insert` is a setting property: muted, never a column.
- The lists of the nearest item at or above whose `_settings` > `Insert` lists
  any apply; lists set further up are not added to them.
- Insert from a list… opens the palette with a tab per list. A row shows its
  parent's title, a date as its chip, then each `with` key and each declared
  column as the column view shows them. The item Insert runs on, the items
  above it, sealed items and anything in a `_settings` are left out, and so is
  what lies inside a private item when the pick would carry it outside.
- A link pick adds a line titled as the pick, KEY holding `[[id:ID][title]]`
  and each `with` key starting at the pick's own value, or what the view
  computes for it when it has none or a formula. `copy` adds a copy with its
  note, properties, children and folds; `copy contents` adds copies of the
  pick's children after the item's own. Nothing makes a mirror, the pick stays
  as it was, and one undo takes away what a pick added.
- A list with no `query`, or an `insert` that does not read, keeps its tab and
  says why in place of rows.
- A `_settings` child is muted in the tree and is neither a column nor a card
  on a board. `Checks:` stays where it is.

## Consequences

- The lists are ordinary items, so the CLI writes them without a command of
  its own.
- Further settings of an item can go under the same `_settings` child.
