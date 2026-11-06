# 51. A board has a key map of its own

- **Status:** accepted, 2026-11-06
- **Supersedes:** the keys in "Moving cards" of
  [0031](0031-a-board-shows-children-as-columns.md) and its consequence on Tab.
  The rest of 0031 stands.
- **Applies to:** `src/keys.ts`, `src/board.ts`, `actions` in `src/editing.ts`,
  the ⋯ menu in `index.html`

## Context

The key handler did not know which view was shown, so the outline's
structure keys ran on cards and did what a board cannot show. Tab nested a
card under the one above, where it vanished. Enter on a card whose children
were open made a hidden child, and Enter on an empty last card turned it into
a column. Backspace and Delete joined a card with a column title or pulled a
whole column into a card. The fold keys changed a synced flag with nothing to
see. Ctrl-[ on a card's page landed on the column shown as a list. The
palette, the help and the ⋯ menu offered all of these on a board, and "On a
board: to the column on the left" in the outline.

## Decision

- Every binding in `src/keys.ts` says `where` it applies: `tree`, `board` or
  `any`, next to a global binding's `reach`. Key lookup, the palette, the help
  and the keys shown after Mod+J see only the bindings for the shown view.
  ⋯ menu entries carry `data-where` and are hidden in the other view.
- On a board, Tab and Shift-Tab move a card to the next or previous column at
  the same height, and a column one place over. Alt-Shift-← and → (commands
  `move-right`, `move-left`) do the same and are listed with Tab. The phone
  toolbar's indent and outdent buttons press Tab and Shift-Tab, so they follow.
- Enter on a card always makes the next card; on a column title it makes the
  first card.
- Backspace and Delete join two cards of one column only.
- Ctrl-[ on a card's page goes to the board when the card's grandparent is
  one; the column's page stays in the breadcrumbs.
- Fold, collapse, expand, Columns, Expand all and Collapse all are for the
  outline: cards show no children yet.

## Options considered

**Branch inside each action on the view.** Fewer table entries, but the
palette and the help would still list the outline's meaning on a board. Enter,
Backspace and Delete do branch inside, since their label fits both views.

**Refuse Tab on a board with a message.** Safer than nesting, but Tab is the
key a hand reaches for to move something one step, and the toolbar's buttons
would stay useless on a phone.

## Consequences

- A card goes under another card through its page or Move to, not Tab.
- In selection mode on a board, Tab does nothing.
