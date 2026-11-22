# 70. Settings holds Bookmarks and Capture templates

- **Status:** accepted, 2026-11-20
- **Supersedes:** in [0060](0060-bookmarks-are-the-children-of-a-system-item.md),
  that Bookmarks sits at the top level of every outline
- **Extends:** [0066](0066-about-bookmarks-lives-in-code-and-bookmarks-is-fixed.md)
- **Applies to:** the table of kept items in `src/model.ts`, `src/syncing.ts`,
  `cli/run.ts`, `server/store.ts`

## Context

Bookmarks was the one item the app keeps under a fixed name, at the top level.
Capture templates are ordinary items found anywhere by their `capture`
property, with no home and no explanation next to them. More fixed items at
the top level would crowd the outline.

## Decision

- The kept items come from one table in code: id, parent, title and, for most,
  an About. Settings (`settings`, no About) is a top-level item; under it,
  always in this order, are Bookmarks (`bookmarks`) and Capture templates
  (`capture-templates`).
- A device of this build makes Settings when it is missing, taking Bookmarks
  from the top level to Settings in the place where Bookmarks stood, and makes
  Capture templates with `capture` and `key` as its columns, the one time
  each is made.
- All three have the fixed titles, no note and no completion, as Bookmarks did
  in ADR 66; none can be deleted, and Bookmarks and Capture templates cannot
  leave Settings. Settings may be moved among the top-level items, folded and
  made private.
- About Capture templates is defined in code like About Bookmarks: read-only,
  never saved or synced. It explains the `capture`, `key`, `ask` and `at`
  properties, the shortcuts and the other ways into Capture. Its shortcut
  lines are written for both Ctrl and ⌘, not read from the key table.
- A template is still any item with a `capture` property, anywhere; Capture
  templates is where they live by default, not the only place.
- The sync server drops a write that renames Settings or Capture templates, or
  gives them a note or completion, as it does for Bookmarks.
- A device that has not been updated keeps Bookmarks at the top level until it
  is; it does not move it back.

## Consequences

- The list of bookmarks and the capture dialog read the same items as before.
- Templates that were made before stay where they are until moved under
  Capture templates by hand or with `outline move`.
