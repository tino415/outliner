# 48. The outline and the sync state live in IndexedDB

- **Status:** accepted, 2026-11-05
- **Applies to:** `src/stateStore.ts`, `src/loaded.ts`, `src/storage.ts`, `src/syncing.ts`
- **Supersedes:** the localStorage part of [0004](0004-localstorage-and-snapshot-undo.md); undo by snapshots stays

## Context

Browsers cap localStorage at about 5 MB for an origin, counted in characters
by Chrome and Firefox (about 5.2 million) and as UTF-16 by Safari (about 2.5
million). A synced outline is stored twice, as the document and as the replica
the sync state keeps, and agents writing through the CLI grow it every day.
Past the cap the save failed, the app said so only for the document and the
sync state was lost without a word.

[0004](0004-localstorage-and-snapshot-undo.md) named IndexedDB as the move to
make once an outline approached the cap.

## Decision

The document and the sync state (replica, queue of unsent changes, sequence
number, device id) are two values in one IndexedDB database,
`outliner-lab-state`, stored as objects. Preferences and the private keys stay
in localStorage; they are small. Attached files keep their own database
([0028](0028-attachments-are-files-on-the-sync-server-by-hash.md)).

Startup waits for the stored values before the first render (`src/loaded.ts`).

Moving from localStorage happens on that first load. The old keys are read, written to
IndexedDB, and removed only after the IndexedDB transaction has committed, so
a device never holds fewer copies than before. A value already in IndexedDB is
not replaced by an old key. The sync protocol and the server are unchanged, so
devices on the old layout keep syncing.

Tabs of one browser tell each other what they stored over a BroadcastChannel,
since IndexedDB fires no storage event. The tab that hears it reads the value
again and follows it as it followed the storage event
([0018](0018-tabs-are-replicas-that-share-stored-state.md)). A tab writing the
sync state does it in one read-and-write transaction and, if another tab wrote
since this tab last looked, merges that state in first; the sync state carries
a `writeId` for this.

After each write the app asks `navigator.storage.estimate()` and shows a
warning once per page load when usage passes 80% of the quota. A failed write of
the document or of the sync state shows a toast that says which, with the
advice to export a backup; it is shown at most every 30 seconds for each.

## Options considered

**Compressing the JSON in localStorage.** Rejected: it postpones the cap by a
factor of a few and the outline keeps growing.

**Keeping localStorage as the fallback when IndexedDB is missing.** Only for
reading: when IndexedDB cannot be opened the app shows what localStorage still
holds, and saving then fails visibly.

## Consequences

- Loading is asynchronous, so the module graph has a top-level await and the
  service worker is registered even when the page has already loaded.
- An old build left open in a tab after the update still writes the old
  localStorage keys. Its changes reach the server from that tab; the new layout
  never reads those keys again once they have been moved. Reload the tab.
- Going back to a build from before this record shows an empty local copy of a
  device that has moved; the data is in IndexedDB. Sync repopulates it, a device
  without sync needs the export.
- Saving on `pagehide` is asynchronous and the browser may drop it; the
  document is also saved when the tab is hidden and when sync is turned off.
