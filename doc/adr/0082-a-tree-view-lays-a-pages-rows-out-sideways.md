# 82. A tree view lays a page's rows out sideways

- **Status:** accepted, 2026-11-28
- **Supersedes:** the Board entry of the ⋯ menu in
  [0031](0031-a-board-shows-children-as-columns.md) and
  [0051](0051-a-board-has-a-key-map-of-its-own.md), now a View row. The rest
  of both stands.
- **Applies to:** `src/sideways.ts`, `src/render.ts`, `src/keys.ts`,
  `src/editing.ts`, `src/style.css`, the ⋯ menu in `index.html`

## Context

An argument map or a plan is a tree whose shape matters: which side has the
weight, which branch is thin. The outline shows the same tree as an indented
list, where the shape has to be read line by line.

## Decision

- `:view: tree` on a page shows it as a tree, shown as Tree: the title at the
  left, its children to the right of it, theirs further right, joined by
  lines. As with the board, the view is a property of the page, so every
  device shows it and the CLI still sees an outline. In the code the view is
  `sideways`, as `tree` already names the outline there.
- The nodes are the outline's own rows, laid out by a style sheet over the
  same `li.item > .row + ul.children` markup. Typing, Enter, Tab, Shift-Tab,
  the fold keys, the move keys and selection work as in the outline, and rows
  are kept between renders as [0009](0009-reuse-rows-between-renders.md)
  says.
- A node shows its title, chips and a note cut at three lines, as a board card
  does, and no columns: Columns is not offered on a Tree page. A node is at
  most 250 px wide, 190 px up to 640 px.
- The round button at a node's right edge folds its branch with the item's own
  fold, so the outline shows the same branches folded, and shows the count of
  children while folded.
- The arrows go across the drawing: up and down among the shown nodes of one
  level, left to the parent, right to the first child.
- A drag on a node's upper half puts the item before it, on its lower half
  after it, and on its right third makes it the node's last child.
- The page scrolls both ways under the top bar and opens with the title at
  the left edge, half way down. On touch a drag scrolls, so a row takes no
  swipe; its menu opens from the bullet.
- The ⋯ menu picks the view in one View row, Outline, Board and Tree, in
  place of the Board switch, since only one of them can be on. "Show this page
  as a tree" is in the palette with no key; Ctrl-J B still toggles the board.
- Bindings and ⋯ menu entries name a list of views they apply in.

## Options considered

**Computed positions, drawn on a canvas or with absolute boxes.** Needed for
a map drawn all around its title, not for one drawn to one side. Rejected
here: the rows would need an editor of their own, and every outline key
would have to be wired again.

**A switch per view in the ⋯ menu.** Rejected: two switches could both be on
for one property.

## Consequences

- A phone shows about one and a half levels across, and the page scrolls
  both ways.
- An app from before this change shows a Tree page as the outline, as it does
  not know the value.
- One `:view:` value replaces another, so a board turned into a tree is no
  longer a board.
