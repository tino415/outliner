# 54. Collapse and expand everything inside an item

- **Status:** accepted, 2026-11-06
- **Applies to:** `collapseInside`, `expandInside` and `toggleInside` in
  `src/editing.ts`, `fold-inside`, `collapse-inside` and `expand-inside` in
  `src/keys.ts`, `foldableInside` in `src/model.ts`

## Context

Ctrl-. folds one item, and ⋯ → Collapse all and Expand all fold the whole
page. A long subtree opened level by level had to be closed level by level
again, or the whole page folded with it. On a board there was no way to
fold every card of one column.

## Decision

- Ctrl-Shift-. on an item collapses it and everything under it, as Collapse
  all does for a page. When the item is folded, or everything under it that
  can fold already is, it expands them all instead.
- The item menu has Collapse everything inside and Expand everything
  inside, shown when the item holds more than one level. The palette and ?
  list both, with Ctrl-Shift-. as their toggle, and each has a command name
  for the shortcuts item.
- On a board it acts on a card and its children, and on a column it folds
  or unfolds the column's cards, since a column shows no fold of its own.
- The period key is read by its position when Shift is held, so Ctrl-Shift-.
  is the same key on layouts that type `>` or `:` there.

## Options considered

**Show N levels, as Emacs's outline cycling or Logseq's "expand to level".**
More to learn and to bind for a gain the two commands already cover.

**Collapse inside but leave the item open.** The item's own fold is the
first thing Ctrl-. would then be pressed for; collapsing it too leaves one
line, as Collapse all does for a page.

## Consequences

- Expanding everything inside a large subtree renders all of it at once.
- The fold flags are the items', so the change shows in the outline, on a
  board and on every device.
