# 56. Detaching deletes an attachment no other item links

- **Status:** accepted, 2026-11-11
- **Applies to:** `detach` in `cli/run.ts`, `DELETE /files/<sha256>` in
  `server/app.ts`, `deleteFile` in `src/sync/files.ts`
- **Amends:** 28 (its consequence that nothing deletes a file)

## Context

`outline attach` uploads a file and links it in a note. Taking the link out
leaves the file in the database, which only grows. The file is named by its
content, so two items that attached the same screenshot share one stored
file.

## Decision

- The sync server answers `DELETE /files/<sha256>` with the token: 204 when
  it deleted the file, 404 `no such file` otherwise. It stays plain storage
  and does not look inside notes.
- `outline detach ITEM HASH` takes every link to the hash out of ITEM's note
  (and a line it leaves empty), then deletes the file unless another item's
  note still links it, printing `kept <hash>, still linked from <id> <path>`
  for each. `outline detach HASH` only deletes the file, with the same check.
- The link goes first: when the delete fails the file stays orphaned, as it
  was, and the bare form removes it later.
- Private items cannot be read, so they are not checked. The file is deleted
  and the command prints how many private items were skipped.

## Options considered

**The server refuses while a note it stores links the hash.** Rejected: notes
reach the server sealed or as plain fields, and the server would have to
parse them; ADR 14 keeps it plain storage.

**A short hash prefix.** Rejected: it would need the server to list files.

## Consequences

- A deleted item, or a browser's undo, can bring back a link to a deleted
  file. Devices that showed the file keep it in IndexedDB; others show a
  missing attachment.
- Until the server runs this change it answers DELETE with 404 `not found`,
  which the command prints as an error.
