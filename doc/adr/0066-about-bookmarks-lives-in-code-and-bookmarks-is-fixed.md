# 66. About Bookmarks lives in code and Bookmarks is fixed

- **Status:** accepted, 2026-11-15
- **Supersedes:** in [0060](0060-bookmarks-are-the-children-of-a-system-item.md),
  that Bookmarks may be renamed and that the sync server accepts every change
  to it; in [0061](0061-bookmarks-explains-itself-in-an-about-item.md), that
  About is stored with fixed ids, may be renamed and edited, may leave the
  first place among its siblings, and that it marks the key column.
- **Applies to:** `withBookmarksParts` and the guards in `src/model.ts`,
  `src/store.ts`, `src/storage.ts`, `src/syncing.ts`, `src/editing.ts`,
  `cli/run.ts`, `server/store.ts`

## Context

Bookmarks and its About item were ordinary items that the app only refused to
delete. Typing in either changed it, on every device, and lines of About were
garbled by stray keystrokes with nothing to put them back. An item the app
needs under a fixed name cannot also be one anyone can rename.

## Decision

- About Bookmarks and its lines are defined in code, with the new id
  `about-bookmarks`, and added in memory to every document that has Bookmarks.
  They are never saved and never synced, so the text follows the build.
- The old stored `bookmarks-about` items are ordinary items now. They stay
  next to the new About, editable and deletable by hand, and the list counts
  the old one as a bookmark until it is deleted.
- About and its lines are read-only throughout: text, note, properties,
  completion, order, and no child can be added, indented, pasted or moved
  into it. About stays first under Bookmarks. Folding is allowed and lasts
  until reload; About is folded on every load.
- Bookmarks' title is always "Bookmarks", its note empty and it cannot be
  completed. Its properties, `columns` included, its folding, its place among
  the top-level items and its children stay editable. Private is allowed.
- The key column is set when Bookmarks is first made, no longer when About is
  made, so removing it sticks.
- The caret may enter read-only text to select and copy it. Typing, pasting
  and cutting do nothing, and the first refused one says "Bookmarks is
  read-only" or "About Bookmarks is read-only". Composition cannot be
  cancelled before it lands on Android, so the text is put back after it.
- The guard is in `src/model.ts`, so the app, the phone, plugins, mirrors and
  the CLI all inherit it. A refused change returns the same document.
- The sync server drops a write that gives Bookmarks a title other than
  "Bookmarks", a note that is neither empty nor sealed, or completion, and
  keeps the rest of the push. A 400 would fail the whole push, and an old
  build would stop syncing.

## Consequences

- A device of this build puts Bookmarks' title, note and completion back to
  code, and writes the difference once. An old build can still edit until the
  server drops its write.
- The two garbled About lines an older build left in the live outline stay as
  ordinary items until deleted.
- `outline show` lists About from the same constant; `outline edit` and the
  other writes on it refuse, and `outline set bookmarks columns ""` works.
- Adding a bookmark never puts it in front of About, whatever `:new: top` says.
