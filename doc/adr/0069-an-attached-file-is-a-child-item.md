# 69. An attached file is a child item, not a line in the note

- **Status:** accepted, 2026-11-20
- **Applies to:** `attachFilesTo` in `src/editing.ts`, `attach`, `detach` and
  `lift-attachments` in `cli/run.ts`, `src/attachmentLinks.ts`
- **Supersedes:** the part of 28 that links a file from its item's note
- **Amends:** 56 (detach also removes children)

## Context

Attaching a file wrote its link into the item's note and opened the note, so
a picture or a file name appeared inside text the item's owner wrote.

## Decision

- Each attached file adds one last child whose title is its link
  (`![glitch.png](att:<sha256>)`); the note is not opened or changed. A title
  with that link already renders as a picture or a 📎 name.
- Attaching in the app unfolds the item; `outline attach` does not. Dropping
  on a row, picking a file, the item menu and pasting outside a note all add
  children.
- Pasting a file while typing in a note adds the child and puts
  `[[id:<child id>][<file name>]]` at the caret (doc/adr/0024).
- `outline attach ITEM FILE` prints the hash, then the child's id.
  `outline detach ITEM HASH` also removes ITEM's children titled with that
  link, and children's titles count as links when deciding to keep the file.
  Deleting the child in the app does not delete the file.
- `outline lift-attachments` moves the links still in notes into children:
  a link alone on its line leaves the note, a link inside a sentence becomes
  an `[[id:…]]` reference to its child. A link already held by a child is not
  added twice. It is run once by hand, since two devices migrating at once
  would make twin children.
- A build that still writes a link into a note keeps working; running the
  command again moves it.

## Options considered

**Migrating in the app on load.** Rejected: two devices would each add a
child for the same link.
