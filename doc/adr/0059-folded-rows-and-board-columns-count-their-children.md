# 59. Folded rows and board columns count their children

- **Status:** accepted, 2026-11-13
- **Applies to:** `src/counts.ts`, `renderItem` in `src/render.ts`,
  `columnHtml` in `src/board.ts`

## Context

A folded page and a Done column gave no sense of how much sits inside.

## Decision

- A folded row shows the number of its direct children; a board column shows
  the number of its cards. Deeper levels are not counted.
- When some of them are completed it reads `2/5 done`. Completed children
  count even while completed items are hidden.
- The count is part of the display-state string in `renderItem` (ADR 9), so
  the row is rebuilt when it changes. Nothing is stored or synced.
