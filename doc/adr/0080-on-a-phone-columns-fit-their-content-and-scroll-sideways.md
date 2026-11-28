# 80. On a phone columns fit their content and scroll sideways

- **Status:** accepted, 2026-11-28
- **Amends:** [0017](0017-properties-in-notes-and-a-column-view-with-rollups.md),
  "A column view per page": on a phone cells are no longer all one width;
  [0016](0016-touch-gestures-on-rows.md): a sideways drag on scrolling
  numbers is not a row swipe
- **Applies to:** `src/columnFit.ts`, `src/render.ts`, `src/gestures.ts`,
  `src/columns.ts`, `src/chrome.ts`, the phone rules in `src/style.css`

## Context

Every cell was 4.6em wide on a phone, so four columns took 312 of a 412 px
screen. A top-level title kept 26 px and wrapped one letter per line. A food
day has four columns: kcal, protein, carbs and fat.

## Decision

- On a screen up to 640 px wide a column is as wide as its widest value: its
  name, its total or a cell, plus 8 px. Values are measured in the total's
  bold font with every digit as `0`, since cells use tabular numbers; names
  in the head's font, capitalized, with its letter spacing. Every row under
  the page counts, folded ones too, so unfolding moves no column. Four food
  columns take 181 px of a 412 px phone and leave a top-level title 171 px.
- Columns that need more than 55% of the window's width, the 10 px before the
  first column included, show in a window of that width and scroll sideways.
  A drag on the numbers, in a row or in the head, moves every row and the
  head together; titles stay. The scroll follows the finger and stops where
  it is let go, with no snap and no momentum. A sideways wheel scrolls it in a
  narrow desktop window. Columns cut by an edge fade out there.
- A page opens at its first column and keeps its place until another page
  opens.
- While columns scroll, a drag that starts on the numbers does not swipe the
  row. A swipe that starts on a title completes the row or opens its menu, as
  before. A page whose columns fit keeps both swipes on the whole row.
- The field of an edited cell is at least 4.6em wide, ends at the cell's right
  edge and covers the cells to its left, but starts no further left than the
  scrolling numbers. A tap on a cell partly past an edge scrolls it into view
  first.
- A window wider than 640 px keeps cells of 6.2em and never scrolls them.
- The widths live on the page element, not in a row's markup, so the
  display-state string of [0009](0009-reuse-rows-between-renders.md) does not
  change. A change of text size fits the columns again.

## Options considered

**Cells of 3em.** Rejected: a value with a unit is cut, and six columns crush
the titles again.

**Numbers under the titles.** Not chosen.
