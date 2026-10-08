# 19. A longer left swipe opens the item menu

- **Status:** accepted, 2026-10-08
- **Supersedes:** the left swipe of [0016](0016-touch-gestures-on-rows.md).
  The rest of 0016 stands.
- **Applies to:** `src/gestures.ts`

## Context

With 0016, a left swipe folds an item that has children and opens the menu
only on items without children. Martin uses the menu often and wants it on
every item. Mail apps on phones solve the same problem with two steps on
one swipe: a short pull for one action, a longer pull for another.

## Decision

A left swipe has two steps on items with children:

- past 72 px it folds or unfolds, as before;
- past 160 px, or 45% of the screen width when that is less, the band
  turns to "More…" and releasing opens the item menu.

Each step is marked by a short vibration where the device supports it. Items
without children open the menu at either step. Right swipes keep one step.

## Consequences

- A long fast left swipe on a parent opens the menu where it used to fold;
  folding needs a shorter pull.
