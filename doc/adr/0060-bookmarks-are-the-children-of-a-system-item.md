# 60. Bookmarks are the children of a system item

- **Status:** accepted, 2026-11-14
- **Applies to:** `src/bookmarks.ts`, `src/bookmarking.ts`, `withBookmarksItem`
  and the guards in `src/model.ts`, `cli/run.ts`
- **Relates to:** 40 (shortcuts set in the outline), 24 (references)

## Context

A shortcut to a page that is opened every day, a Payout plan or an inbox,
took a search each time. Every tool researched keeps one ordered list of
such pages, and none flags the targets themselves.

## Decision

- The list is the item with the fixed id `bookmarks`, at the top level, as
  the top of the outline has the id `root`. Every device and the CLI make it
  the first time they run without one, a device after its first sync round.
  Two devices that make it offline merge into one item, since the sync merges
  fields per item.
- A child is one bookmark and child order is palette order. A child that is
  one `[[id:…]]` or `[[Text]]` link opens that item, a child that is one URL
  opens it in a new tab, any other child is its own destination, so a query
  item there is a dynamic bookmark.
- A child's `key` property of 1 to 9 gives it ⌘J and that digit. ⌘J 0 opens
  the list. All are commands of the shortcut table, rebindable as any other.
- Bookmark this page, in Ctrl-K and the ⋯ menu with no key of its own, adds a
  link at the end of the list and only says so when the page is there
  already. A private item is added as "Private item".
- The item stays: delete, swipe, Move to, indent, drag and `outline rm` or
  `move` out of the top level refuse it with "Bookmarks stays; empty it
  instead". A selection that holds it (select all, Clear this page) deletes
  the other items and says that Bookmarks stays. It may be renamed and moved
  among the top-level items. Duplicate makes an ordinary copy with a new id.
- A server holding only this item counts as empty when a device connects, so
  the device uploads its outline.
- The bookmarks come first in the empty jump palette, before the recent items.

## Consequences

- The sync server keeps accepting every change, so a client of an older build
  can still delete the item; the next device to run makes it again. A
  server-side guard would be a later deploy.
- Every outline shows one more top-level item, and the CLI's `show` lists it.
