# 64. Item pickers match paths written with slashes

- **Status:** accepted, 2026-11-16
- **Applies to:** `findItems` in `src/search.ts`

## Context

Every item picker (jump palette, Move to, Mirror, Link to, Send to column)
finds items by words in their own title. An item called `IEx` exists under
several parents, and the only way to pick the right one was to scroll the
list and read each path.

## Decision

- A query with a slash is a path query, split on slashes with the spaces
  around each part trimmed. A colon is not the separator: it clashes with
  columns (`TODO:`), kinds (`Question:`) and query words (`is:open`).
- Strict match: the parts are a substring of the item's path joined with
  slashes. The first part ends an ancestor's title, middle parts equal whole
  titles, the last part starts the item's own title, and each level is the
  direct parent of the next. `ID/IEx` finds `Test > PayoutID > IEx`.
- Loose match: each part appears in a title, top to bottom, and levels may be
  skipped. `Pay/IEx` and `Test/IEx` both find `Test > PayoutID > IEx`.
- A leading slash anchors nothing above, so `/IEx` lists every item starting
  with `IEx`. A trailing slash lists children, so `TODO:/` lists the columns.
  Both are strict only.
- Case is ignored. Spaces inside a part are literal for strict and any order
  for loose.
- Strict matches come first, then loose ones, then titles that contain the
  query literally, each ranked as before: start match, depth, reading order.
- In the jump palette no command is lifted above the items for a path query.

## Consequences

- The search box on the page and query views keep their syntax; `under:`
  still takes a slash path there.
- A title that has a slash in it is still found by typing it, after the path
  matches.
