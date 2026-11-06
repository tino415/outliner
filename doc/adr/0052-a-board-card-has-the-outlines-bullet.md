# 52. A board's cards and columns have the outline's bullet

- **Status:** accepted, 2026-11-06
- **Supersedes:** the toggle and "Moving cards" by the handle in
  [0031](0031-a-board-shows-children-as-columns.md). Its structure, its
  cards being ordinary editors and its other consequences stand.
- **Applies to:** `src/board.ts`, `enableBulletHandles` in `src/bullets.ts`,
  the item menu in `src/chrome.ts`

## Context

On a board, each gesture meant something other than in the outline. A
card was dragged by a ⠿ handle at its left. It was opened by a link in its
top-right corner, and its item menu could not be opened at all. A column
could not be dragged. A card dropped outside every column landed where the
last marker had been. "+ property", a file dropped on an item, and
`:new: top` worked only in the outline. 0031 also names Alt-Shift-B as the
toggle, which is Mod-J B now.

## Decision

- Cards and column titles show the outline's `.bullet` at the left of
  their text. `enableBulletHandles` is bound to `#board` as to `#tree`, so
  a click opens the item, a drag moves it, and a right click or a long
  press opens the item menu. The handle and the corner link are gone. A
  card with items under it still says how many, as a link.
- The bullet's drag asks its view where an item can land (`DropPlaces`).
  On a board a card lands between two cards of the column under the
  pointer, and a column between two columns. Anywhere else nothing is
  offered and the item stays where it was.
- The item menu opened on a card offers "To the column on the right" and
  "To the column on the left", which keep the card's height as Tab does
  (0051). Collapse is left out of it on a board.
- "+ property" shows on hover and focus on cards and column titles. A
  column title shows its chips under it.
- A file dropped on a card or a column title is attached to it.
- "+ Add a card" puts the card first in a column with `:new: top`.
- Mod-J B (or ⋯ → Board) toggles the view.

## Options considered

**Keep a small open link on the card beside the bullet.** It would give
two targets for one action. The bullet already opens the card and the
"N inside" link stays.

**Swipes on cards, as on rows.** A left swipe would fight the sideways
scroll of the board on a phone. The long press on the bullet opens the
same menu.

## Consequences

- A card is moved by the same gesture as a row, and the item menu's
  entries work on cards.
- A column has a drag target of its own.
