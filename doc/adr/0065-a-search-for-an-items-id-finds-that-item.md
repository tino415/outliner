# 65. A search for an item's id finds that item

- **Status:** accepted, 2026-11-16
- **Applies to:** `itemNamedBy` in `src/itemLink.ts`, `search` in
  `src/search.ts`, `matchingItems` in `src/navigation.ts`,
  `renderSearchSummary` in `src/render.ts`
- **Extends:** 50

## Context

A link to an item (50) carries its id, but nothing in the app could take an id
back to its item: a pasted link or id searched as text and found nothing.

## Decision

- The search bar and the jump palette accept a whole id, or a link to an item
  (everything up to `#/` is dropped), and the item it names is the match.
- Only a whole id matches. A part of an id, or an id no item has, searches as
  text.
- In the palette the named item comes first, the text matches follow, and
  Enter opens it.
- In the search bar an item under the page shows as the only match with its
  ancestors, and nothing is highlighted.
- An item outside the page, or hidden as completed, shows "Not on this page:
  <title>" with an Open button, which zooms to it and clears the search.

## Consequences

- A link copied from one device can be pasted into search on another.
- The summary of a search carries a second kind of result, `elsewhere`, that
  no text search produces.
