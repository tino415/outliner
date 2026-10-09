# 28. Attachments are files on the sync server, named by their hash

- **Status:** accepted, 2026-10-09
- **Applies to:** `server/app.ts`, `server/store.ts`, `src/sync/files.ts`, `src/attachments.ts`, `src/attachmentLinks.ts`, `outline attach` and `outline file`

## Context

Martin wanted to report a visual glitch from his phone and had nowhere to
put the screenshot. An item needs files: images to look at, other files to
open. The outline syncs as text fields of at most 100,000 characters
(doc/adr/0012), and a screenshot is several hundred kilobytes. Martin left
where files live to me.

## Decision

**Files live on the sync server, in its SQLite database, under the SHA-256
of their content.** `PUT /files/<sha256>` stores one (the server checks the
hash, 10 MB at most), `GET /files/<sha256>` returns it; both need the token.
The hash makes a file immutable, so it can be cached for good and uploaded
twice without harm.

**An item links its files from its note as Markdown with an `att:` target**:
`![glitch.png](att:<sha256>)` for an image, `[report.pdf](att:<sha256>)`
for anything else, one per line. The text stays the raw text
(doc/adr/0003); outside editing an image shows as a picture and a file as
a 📎 name, and a click opens or downloads it.

**The browser keeps every file it attaches or shows in IndexedDB.** A
pasted, dropped or picked file (Alt-Shift-A, the item menu) is stored there
first and uploaded after each successful sync, so attaching works offline
and without sync. A file attached elsewhere is fetched with the token once
and kept.

**The CLI attaches and fetches**: `outline attach ITEM FILE` uploads and
adds the link, `outline file HASH PATH` saves a file, so an agent can look
at a screenshot.

## Options considered

**The file inline in the note as a `data:` URL.** Rejected: over the note
size limit for any screenshot, and sent on every sync.

**Files on disk next to the database.** One more place to back up and to
give the server write access to; the database is already the backup.

**`<img src>` pointing at the server.** An image request cannot carry the
token, and putting the token in the URL would leak it into logs and
history.

## Consequences

- The live `sync` container has to be rebuilt for uploads to work; until
  then files stay on the device that attached them and upload later.
- Old app builds show the link text.
- Nothing deletes a file whose link was removed; the database only grows.
