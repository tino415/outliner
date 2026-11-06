# 53. A card folds like a row, and a column shows its note

- **Status:** accepted, 2026-11-06
- **Supersedes:** in [0051](0051-a-board-has-a-key-map-of-its-own.md), that
  fold, collapse, expand, Expand all and Collapse all are for the outline
  only; in [0031](0031-a-board-shows-children-as-columns.md), that a card
  with items under it only says how many.
- **Applies to:** `cardHtml` and `columnHtml` in `src/board.ts`, `fold`,
  `collapse` and `expand` in `src/keys.ts` and `src/editing.ts`

## Context

The fold flag is synced per item, but a board ignored it: a card showed
"N inside" whatever the flag said, so the fold keys, the item menu's
Collapse and ⋯ → Collapse all had nothing to show and were taken off the
board. An agent's `Question:` children under a card could only be read
on the card's page. A column's note, such as what a column is for, was
not shown at all.

## Decision

- A card with children has the fold arrow of a row. Expanded, it shows one
  level of its children as rows, which are ordinary editors; a child with
  children of its own says how many. Folded, the card says how many it
  holds.
- A card starts expanded or folded by its own collapsed flag, as in the
  tree.
- Ctrl-., Mod-↑ and ↓, the arrow, the item menu's Collapse, Expand all and
  Collapse all act on a board. They fold cards only: on a column or a
  card's child they do nothing, since neither shows a fold.
- Enter in a card's children makes another child of the card. Tab there
  does nothing.
- A column shows its note under its title, as a muted line edited in
  place, with its chips.

## Options considered

**Children read-only, a click opening the card.** Safer to lay out, but
they are ordinary editors already, and editing an answer where it is
read saves a trip to the card's page.

**Every level of children.** Cards would grow without bound. One level
and the count keep a card's height near its content.

## Consequences

- A card grows with its children; folding it, or Collapse all, brings
  the board back to one line per card.
- Folding a card on a board folds it in the outline too, as the flag is
  the item's.
