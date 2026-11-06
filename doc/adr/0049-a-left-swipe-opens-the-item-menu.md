# 49. A left swipe opens the item menu

- **Status:** accepted, 2026-11-04
- **Supersedes:** [0019](0019-a-longer-left-swipe-opens-the-item-menu.md) and
  the left swipe of [0016](0016-touch-gestures-on-rows.md). The rest of 0016
  stands.
- **Applies to:** `src/gestures.ts`

## Context

With 0019 a short left swipe folds or unfolds an item with children and a
longer one opens the item menu. The fold swipe is not used: the arrow beside
the item folds, and the two steps make the menu harder to reach.

## Decision

A left swipe past 72 px opens the item menu, on every item. There is no
fold or unfold swipe. Right swipes keep one step: complete or reopen.

## Consequences

- The far threshold and its second vibration are gone.
- Folding on a phone is the arrow beside the item only.
