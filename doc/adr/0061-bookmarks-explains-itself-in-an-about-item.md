# 61. Bookmarks explains itself in an About item

- **Status:** accepted, 2026-11-14
- **Applies to:** `withBookmarksItem` and the guards in `src/model.ts`,
  `src/bookmarks.ts`, `cli/run.ts`
- **Relates to:** 60 (Bookmarks are the children of a system item), 32
  (properties)

## Context

Bookmarks did not say how it works: that a child is a bookmark, that a link or
a web address opens, that a digit in the key column gives a shortcut. A
separate top-level item would always show; a child can be collapsed or hidden
by someone who knows it already.

## Decision

- The first child of Bookmarks is "About Bookmarks", with the fixed id
  `bookmarks-about`, collapsed. Its lines are its children, also with fixed
  ids, so two devices that make it offline merge into one item.
- It is kept like Bookmarks: made when missing, refused by delete, merge,
  indent, drag, Move to and `outline rm` or `move`, and skipped by Remove
  completed and by a selection that holds it. It may leave the first place
  among its siblings but not Bookmarks. It may be renamed and its lines
  edited.
- `bookmarksIn` skips it, so it is neither a bookmark nor a digit.
- When the About item is made, Bookmarks gets the property `columns: key`, so
  it opens in column view with an empty key column beside every bookmark. The
  item doubles as the mark that this happened: a device that finds it never
  sets the property again, so removing the property sticks. A `columns` value
  already on Bookmarks is kept.
- Bookmarks stays at the top level. Settings and the template, plugin and
  shortcut headings are out of scope.

## Consequences

- An outline that had Bookmarks gets the About item and the key column the
  first time a device of this build runs.
- A client of an older build can still delete the item; the next device of
  this build makes it again, with the key column, once more.
- `outline show` lists the About lines under Bookmarks.
